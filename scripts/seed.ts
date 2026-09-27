// scripts/seed.ts: loads verified seed data into Postgres as published versions.
//   npm run seed                  → data/seed (real, verified content)
//   SEED_FIXTURES=1 npm run seed  → data/fixtures/v3 (synthetic; dev database only)
//
// Idempotent: a version that already exists is left untouched, because published content is immutable
// (§10.1 "Publish semantics" and the A.3 trigger). Run through `prisma db seed` so .env.local is loaded.
import { join } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { canonicalJson, contentHash } from "../lib/server/contentHash";
import { PrismaClient, type Prisma } from "../lib/server/db/generated/client";
import { errorCodes, isServable, loadSeedRoot } from "./seedFiles";

config({ path: [".env.local", ".env"], quiet: true });

type Action = "created" | "exists" | "pointer moved" | "CONFLICT";
interface Row {
  kind: "module" | "template";
  id: string;
  version: number;
  action: Action;
  note?: string;
}

/** Stores the canonical form, so the bytes we hashed are the bytes we saved. */
const canonical = (value: unknown): Prisma.InputJsonValue => JSON.parse(canonicalJson(value));

function resolveRoot(): { root: string; label: string } {
  if (process.env["SEED_FIXTURES"] !== "1") {
    return { root: join(process.cwd(), "data", "seed"), label: "data/seed" };
  }

  // Synthetic data must never reach the demo project, so the fixture path only unlocks when the
  // connection string we are about to write to contains the dev project ref.
  const devRef = process.env["DEV_PROJECT_REF"]?.trim();
  const directUrl = process.env["DIRECT_URL"] ?? "";
  if (devRef === undefined || devRef.length < 4) {
    throw new Error("SEED_FIXTURES=1 needs DEV_PROJECT_REF in .env.local (the civicweave-dev project ref)");
  }
  if (!directUrl.includes(devRef)) {
    throw new Error(
      `SEED_FIXTURES=1 refused: DIRECT_URL does not contain DEV_PROJECT_REF (${devRef}), so this is not the dev database`,
    );
  }
  return { root: join(process.cwd(), "data", "fixtures", "v3"), label: "data/fixtures/v3" };
}

function printTable(rows: readonly Row[]): void {
  const width = (pick: (row: Row) => string, head: string): number =>
    Math.max(head.length, ...rows.map((row) => pick(row).length));
  const idWidth = width((r) => r.id, "id");
  const kindWidth = width((r) => r.kind, "kind");
  console.log(`\n${"kind".padEnd(kindWidth)}  ${"id".padEnd(idWidth)}  ver  action`);
  for (const row of rows) {
    const note = row.note === undefined ? "" : `  ${row.note}`;
    console.log(`${row.kind.padEnd(kindWidth)}  ${row.id.padEnd(idWidth)}  ${String(row.version).padStart(3)}  ${row.action}${note}`);
  }
}

async function main(): Promise<void> {
  const { root, label } = resolveRoot();
  const load = loadSeedRoot(root);

  for (const failure of load.failures) {
    console.error(`FAIL  ${failure.label}`);
    for (const detail of failure.details) console.error(`        ${detail}`);
  }
  for (const file of [...load.modules, ...load.templates]) {
    if (!file.analysis.ok) console.error(`FAIL  ${file.label}  errors: ${errorCodes(file.analysis).join(", ")}`);
  }
  if (!isServable(load)) {
    throw new Error(`${label} did not validate; nothing was written. Run npm run validate:seed for the detail.`);
  }
  if (load.modules.length === 0 && load.templates.length === 0) {
    console.log(`${label} is empty: nothing to seed.`);
    return;
  }

  const connectionString = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error("DIRECT_URL is not set: seeding uses the session pooler (§13.6)");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const rows: Row[] = [];
  let conflicts = 0;

  try {
    for (const { value: module } of load.modules) {
      const hash = contentHash(module);
      const row = await prisma.$transaction(async (tx): Promise<Row> => {
        await tx.approvalModule.upsert({
          where: { id: module.moduleId },
          create: { id: module.moduleId, title: module.title, authoritySlug: module.authority.slug },
          update: { title: module.title, authoritySlug: module.authority.slug },
        });

        const existing = await tx.approvalModuleVersion.findUnique({
          where: { moduleId_version: { moduleId: module.moduleId, version: module.version } },
        });

        if (existing !== null) {
          if (existing.contentHash !== hash) {
            return {
              kind: "module",
              id: module.moduleId,
              version: module.version,
              action: "CONFLICT",
              note: "already published with different content; bump version in the file",
            };
          }
          if (existing.status === "published") {
            const pointerMoved = await movePointer(tx, module.moduleId, existing.id);
            return { kind: "module", id: module.moduleId, version: module.version, action: pointerMoved ? "pointer moved" : "exists" };
          }
        }

        // Publishing a new version supersedes the previous one, so "status = published" stays unique
        // per module, exactly as the admin publish path does (§10.1). Only the status changes, which
        // the immutability trigger allows; content is never touched.
        await tx.approvalModuleVersion.updateMany({
          where: { moduleId: module.moduleId, status: "published" },
          data: { status: "superseded" },
        });
        const created = await tx.approvalModuleVersion.create({
          data: {
            moduleId: module.moduleId,
            version: module.version,
            content: canonical(module),
            contentHash: hash,
            status: "published",
            publishedAt: new Date(),
          },
        });
        await movePointer(tx, module.moduleId, created.id);
        return { kind: "module", id: module.moduleId, version: module.version, action: "created" };
      });
      if (row.action === "CONFLICT") conflicts += 1;
      rows.push(row);
    }

    for (const { value: template } of load.templates) {
      const hash = contentHash(template);
      const row = await prisma.$transaction(async (tx): Promise<Row> => {
        await tx.journeyTemplate.upsert({
          where: { id: template.taskId },
          create: { id: template.taskId, title: template.title, category: template.category, keywords: [...template.keywords] },
          update: { title: template.title, category: template.category, keywords: [...template.keywords] },
        });

        const existing = await tx.journeyTemplateRevision.findUnique({
          where: { templateId_revision: { templateId: template.taskId, revision: template.revision } },
        });

        if (existing !== null) {
          if (existing.contentHash !== hash) {
            return {
              kind: "template",
              id: template.taskId,
              version: template.revision,
              action: "CONFLICT",
              note: "already published with different content; bump revision in the file",
            };
          }
          if (existing.status === "published") {
            const pointerMoved = await moveTemplatePointer(tx, template.taskId, existing.id);
            return { kind: "template", id: template.taskId, version: template.revision, action: pointerMoved ? "pointer moved" : "exists" };
          }
        }

        await tx.journeyTemplateRevision.updateMany({
          where: { templateId: template.taskId, status: "published" },
          data: { status: "superseded" },
        });
        const created = await tx.journeyTemplateRevision.create({
          data: {
            templateId: template.taskId,
            revision: template.revision,
            content: canonical(template),
            contentHash: hash,
            status: "published",
            publishedAt: new Date(),
          },
        });
        await moveTemplatePointer(tx, template.taskId, created.id);
        return { kind: "template", id: template.taskId, version: template.revision, action: "created" };
      });
      if (row.action === "CONFLICT") conflicts += 1;
      rows.push(row);
    }
  } finally {
    await prisma.$disconnect();
  }

  printTable(rows);
  console.log(`\n${label}: ${rows.filter((r) => r.action === "created").length} created, ${rows.filter((r) => r.action === "exists").length} unchanged, ${conflicts} conflict(s)`);
  if (conflicts > 0) process.exitCode = 1;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Points approval_modules.published_version_id at this version. Returns true when it changed. */
async function movePointer(tx: Tx, moduleId: string, versionId: string): Promise<boolean> {
  const current = await tx.approvalModule.findUnique({ where: { id: moduleId }, select: { publishedVersionId: true } });
  if (current?.publishedVersionId === versionId) return false;
  await tx.approvalModule.update({ where: { id: moduleId }, data: { publishedVersionId: versionId } });
  return true;
}

async function moveTemplatePointer(tx: Tx, taskId: string, revisionId: string): Promise<boolean> {
  const current = await tx.journeyTemplate.findUnique({ where: { id: taskId }, select: { publishedRevisionId: true } });
  if (current?.publishedRevisionId === revisionId) return false;
  await tx.journeyTemplate.update({ where: { id: taskId }, data: { publishedRevisionId: revisionId } });
  return true;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
