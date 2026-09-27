import "server-only";
import { analyzeModule, type GraphAnalysis } from "@/lib/contract/analyze";
import { approvalModuleSchema, type ApprovalModule } from "@/lib/contract/schema";
import { canonicalJson, contentHash } from "../contentHash";
import { getPrisma } from "../db/client";
import type { Prisma } from "../db/generated/client";
import { writeAudit, type AdminResult } from "./types";

export interface ModuleRow {
  moduleId: string;
  title: string;
  publishedVersion: number | null;
  draftVersion: number | null;
  stepCount: number;
  verifiedCount: number;
  flaggedCount: number;
}

export interface ModuleDetail {
  moduleId: string;
  published: { version: number; contentHash: string; content: ApprovalModule } | null;
  draft: { version: number; contentHash: string; content: ApprovalModule } | null;
  analysis: GraphAnalysis;
}

const canonical = (value: unknown): Prisma.InputJsonValue => JSON.parse(canonicalJson(value));

/** Milestones carry no review, so only action steps are counted. */
function counts(module: ApprovalModule | null): Pick<ModuleRow, "stepCount" | "verifiedCount" | "flaggedCount"> {
  if (module === null) return { stepCount: 0, verifiedCount: 0, flaggedCount: 0 };
  const actionSteps = module.steps.filter((step) => step.kind !== "milestone");
  return {
    stepCount: actionSteps.length,
    verifiedCount: actionSteps.filter((step) => step.review.status === "verified").length,
    flaggedCount: actionSteps.filter((step) => step.review.status === "flagged").length,
  };
}

function parseContent(moduleId: string, content: unknown): ApprovalModule | null {
  const parsed = approvalModuleSchema.safeParse(content);
  if (!parsed.success) {
    console.error(`admin: stored module ${moduleId} does not match contract v3`);
    return null;
  }
  return parsed.data;
}

export async function listModules(): Promise<ModuleRow[]> {
  const prisma = getPrisma();
  const modules = await prisma.approvalModule.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      publishedVersionId: true,
      versions: {
        where: { status: { in: ["published", "draft"] } },
        select: { id: true, version: true, status: true, content: true },
      },
    },
  });

  return modules.map((entry) => {
    const draft = entry.versions.find((version) => version.status === "draft") ?? null;
    const published = entry.versions.find((version) => version.id === entry.publishedVersionId) ?? null;
    // The counts describe what an admin is about to review, so the draft wins when there is one.
    const reviewing = parseContent(entry.id, (draft ?? published)?.content);
    return {
      moduleId: entry.id,
      title: entry.title,
      publishedVersion: published?.version ?? null,
      draftVersion: draft?.version ?? null,
      ...counts(reviewing),
    };
  });
}

export async function getModule(moduleId: string): Promise<AdminResult<ModuleDetail>> {
  const prisma = getPrisma();
  const row = await prisma.approvalModule.findUnique({
    where: { id: moduleId },
    select: {
      id: true,
      publishedVersionId: true,
      versions: {
        where: { status: { in: ["published", "draft"] } },
        select: { id: true, version: true, status: true, content: true, contentHash: true },
      },
    },
  });
  if (row === null) return { ok: false, code: "not_found", message: "No module has that id." };

  const draftRow = row.versions.find((version) => version.status === "draft") ?? null;
  const publishedRow = row.versions.find((version) => version.id === row.publishedVersionId) ?? null;

  const draftContent = draftRow === null ? null : parseContent(moduleId, draftRow.content);
  const publishedContent = publishedRow === null ? null : parseContent(moduleId, publishedRow.content);

  const reviewing = draftContent ?? publishedContent;
  if (reviewing === null) return { ok: false, code: "not_found", message: "This module has no readable version." };

  return {
    ok: true,
    value: {
      moduleId,
      published:
        publishedRow === null || publishedContent === null
          ? null
          : { version: publishedRow.version, contentHash: publishedRow.contentHash, content: publishedContent },
      draft:
        draftRow === null || draftContent === null
          ? null
          : { version: draftRow.version, contentHash: draftRow.contentHash, content: draftContent },
      analysis: analyzeModule(reviewing),
    },
  };
}

export interface SavedDraft {
  version: number;
  contentHash: string;
  analysis: GraphAnalysis;
}

/**
 * Saves the whole module as its draft (§10.1).
 *
 * baseHash is optimistic concurrency: it must match the current draft, or the published version when
 * there is no draft, so two admins editing at once cannot silently overwrite each other. There is at
 * most one draft per module, enforced by a partial unique index, so an existing draft is updated in
 * place rather than stacking up new versions.
 */
export async function saveDraft(
  moduleId: string,
  content: ApprovalModule,
  baseHash: string,
  actorId: string,
): Promise<AdminResult<SavedDraft>> {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx): Promise<AdminResult<SavedDraft>> => {
    const row = await tx.approvalModule.findUnique({
      where: { id: moduleId },
      select: {
        publishedVersionId: true,
        versions: { select: { id: true, version: true, status: true, contentHash: true } },
      },
    });
    if (row === null) return { ok: false, code: "not_found", message: "No module has that id." };

    const draft = row.versions.find((version) => version.status === "draft") ?? null;
    const published = row.versions.find((version) => version.id === row.publishedVersionId) ?? null;
    const expectedBase = draft?.contentHash ?? published?.contentHash ?? null;

    if (expectedBase === null || baseHash !== expectedBase) {
      return { ok: false, code: "conflict", message: "Someone changed this module. Reload to see their version." };
    }

    // The server owns the version number (F.2). An existing draft keeps its own; a new one takes the
    // next. The number also lives inside the content, and a template pins "<moduleId>@<version>", so
    // the two must agree or analyzeTemplate cannot resolve the pin at publish time.
    const latest = row.versions.reduce((max, version) => Math.max(max, version.version), 0);
    const version = draft?.version ?? latest + 1;
    const versioned: ApprovalModule = { ...content, version };

    const analysis = analyzeModule(versioned);
    if (!analysis.ok) {
      return {
        ok: false,
        code: "invalid_graph",
        message: "The module does not pass validation.",
        issues: analysis.issues.filter((issue) => issue.severity === "error"),
      };
    }
    const hash = contentHash(versioned);

    if (draft !== null) {
      // Compare-and-swap rather than a plain update: the read above is not enough, because two admins
      // saving at once can both pass it under READ COMMITTED and the second would silently overwrite
      // the first. Matching on the hash we based this edit on makes the check part of the write.
      const swapped = await tx.approvalModuleVersion.updateMany({
        where: { id: draft.id, contentHash: draft.contentHash, status: "draft" },
        data: { content: canonical(versioned), contentHash: hash },
      });
      if (swapped.count !== 1) {
        return { ok: false, code: "conflict", message: "Someone changed this module. Reload to see their version." };
      }
    } else {
      try {
        await tx.approvalModuleVersion.create({
          data: { moduleId, version, content: canonical(versioned), contentHash: hash, status: "draft" },
        });
      } catch {
        // one_draft_per_module (A.3) or the (module_id, version) unique index: another admin created
        // the draft first. That is a conflict, not a server error.
        return { ok: false, code: "conflict", message: "Someone created a draft first. Reload to see it." };
      }
    }

    await writeAudit(tx, {
      actorId,
      action: "module.save_draft",
      entityType: "approval_module_version",
      entityId: `${moduleId}@${version}`,
      beforeHash: draft?.contentHash ?? published?.contentHash ?? null,
      afterHash: hash,
    });

    return { ok: true, value: { version, contentHash: hash, analysis } };
  });
}
