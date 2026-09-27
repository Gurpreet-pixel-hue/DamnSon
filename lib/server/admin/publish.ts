import "server-only";
import { analyzeTemplate } from "@/lib/contract/analyze";
import {
  approvalModuleSchema,
  journeyTemplateSchema,
  type ApprovalModule,
  type JourneyTemplate,
} from "@/lib/contract/schema";
import { canonicalJson, contentHash } from "../contentHash";
import { getPrisma } from "../db/client";
import type { Prisma } from "../db/generated/client";
import { writeAudit, type AdminResult, type Tx } from "./types";

export interface PublishResult {
  revision: number;
  publishedAt: string;
  /** Every module version the new revision pins. All of them are published once this returns. */
  modulesPublished: { moduleId: string; version: number }[];
}

const canonical = (value: unknown): Prisma.InputJsonValue => JSON.parse(canonicalJson(value));

/**
 * Publishes a template (§10.1 "Publish semantics").
 *
 * Re-pins every module to its latest version, draft or published, validates the maximal composition,
 * and only then, in one transaction: promotes those drafts, supersedes what they replace, inserts the
 * new revision, moves both pointers and writes the audit rows. Nothing is written if analysis fails,
 * so a broken graph can never become citizen-facing.
 */
export async function publishTemplate(
  taskId: string,
  expectedRevision: number,
  actorId: string,
): Promise<AdminResult<PublishResult>> {
  const prisma = getPrisma();

  const template = await prisma.journeyTemplate.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      publishedRevisionId: true,
      revisions: { select: { id: true, revision: true, status: true, content: true, contentHash: true } },
    },
  });
  if (template === null || template.revisions.length === 0) {
    return { ok: false, code: "not_found", message: "No template has that id." };
  }

  const latest = template.revisions.reduce((best, revision) => (revision.revision > best.revision ? revision : best));
  if (expectedRevision !== latest.revision) {
    return {
      ok: false,
      code: "conflict",
      message: `Someone published revision ${latest.revision} already. Reload to see it.`,
    };
  }

  const parsedLatest = journeyTemplateSchema.safeParse(latest.content);
  if (!parsedLatest.success) {
    return { ok: false, code: "not_found", message: "The latest revision does not match contract v3." };
  }

  // Re-pin to the newest version of each module, so publishing a template also publishes the drafts
  // an admin has been preparing.
  const pinnedIds = parsedLatest.data.modules.map((pin) => pin.moduleId);
  const newest = await prisma.approvalModuleVersion.findMany({
    where: { moduleId: { in: pinnedIds } },
    orderBy: [{ moduleId: "asc" }, { version: "desc" }],
    select: { id: true, moduleId: true, version: true, status: true, content: true, contentHash: true },
  });

  const newestByModule = new Map<string, (typeof newest)[number]>();
  for (const row of newest) {
    if (!newestByModule.has(row.moduleId)) newestByModule.set(row.moduleId, row);
  }

  const modules: ApprovalModule[] = [];
  const repinned: { moduleId: string; version: number }[] = [];
  for (const moduleId of pinnedIds) {
    const row = newestByModule.get(moduleId);
    if (row === undefined) {
      return { ok: false, code: "not_found", message: `Module ${moduleId} is not in the database.` };
    }
    const parsed = approvalModuleSchema.safeParse(row.content);
    if (!parsed.success) {
      return { ok: false, code: "not_found", message: `Module ${moduleId} version ${row.version} does not match contract v3.` };
    }
    modules.push(parsed.data);
    repinned.push({ moduleId, version: row.version });
  }

  const nextRevision = latest.revision + 1;
  const candidate: JourneyTemplate = {
    ...parsedLatest.data,
    revision: nextRevision,
    modules: parsedLatest.data.modules.map((pin) => ({
      ...pin,
      version: newestByModule.get(pin.moduleId)?.version ?? pin.version,
    })),
  };

  const analysis = analyzeTemplate(candidate, modules);
  if (!analysis.ok) {
    return {
      ok: false,
      code: "invalid_graph",
      message: "The template does not pass validation, so nothing was published.",
      issues: analysis.issues.filter((issue) => issue.severity === "error"),
    };
  }

  const candidateHash = contentHash(candidate);
  const publishedAt = new Date();

  return prisma.$transaction(async (tx): Promise<AdminResult<PublishResult>> => {
    // Re-read inside the transaction: another admin may have published between the check and here.
    const current = await tx.journeyTemplateRevision.findFirst({
      where: { templateId: taskId },
      orderBy: { revision: "desc" },
      select: { revision: true },
    });
    if (current === null || current.revision !== expectedRevision) {
      return { ok: false, code: "conflict", message: "Someone published while this was being prepared. Reload." };
    }

    for (const pin of repinned) {
      const row = newestByModule.get(pin.moduleId);
      if (row === undefined || row.status === "published") continue;

      const promoted = await promoteModuleVersion(tx, { moduleId: pin.moduleId, versionId: row.id, publishedAt, actorId });
      if (!promoted) {
        return {
          ok: false,
          code: "conflict",
          message: `Someone published ${pin.moduleId} while this was being prepared. Reload.`,
        };
      }
      await writeAudit(tx, {
        actorId,
        action: "module.publish",
        entityType: "approval_module_version",
        entityId: `${pin.moduleId}@${pin.version}`,
        afterHash: row.contentHash,
      });
    }

    await tx.journeyTemplateRevision.updateMany({
      where: { templateId: taskId, status: "published" },
      data: { status: "superseded" },
    });

    // The unique index on (template_id, revision) is the real guard: if another publish inserted this
    // revision between the check above and here, the insert fails rather than producing two. That is
    // a conflict for the caller to retry, not a server error.
    let created: { id: string };
    try {
      created = await tx.journeyTemplateRevision.create({
        data: {
          templateId: taskId,
          revision: nextRevision,
          content: canonical(candidate),
          contentHash: candidateHash,
          status: "published",
          publishedAt,
          publishedBy: actorId,
        },
        select: { id: true },
      });
    } catch {
      return { ok: false, code: "conflict", message: "Someone published this revision first. Reload." };
    }

    await tx.journeyTemplate.update({
      where: { id: taskId },
      data: {
        publishedRevisionId: created.id,
        title: candidate.title,
        category: candidate.category,
        keywords: [...candidate.keywords],
      },
    });

    await writeAudit(tx, {
      actorId,
      action: "template.publish",
      entityType: "journey_template_revision",
      entityId: `${taskId}@${nextRevision}`,
      beforeHash: latest.contentHash,
      afterHash: candidateHash,
    });

    return {
      ok: true,
      value: { revision: nextRevision, publishedAt: publishedAt.toISOString(), modulesPublished: repinned },
    };
  });
}

/**
 * Promotes one draft and supersedes whatever it replaces, so exactly one version stays published.
 *
 * The draft is claimed first, with `status: "draft"` in the where clause. If another admin published
 * it between the read above and here, the claim matches nothing and we back out — rather than
 * superseding the version they just published and leaving the module with none.
 *
 * Returns false when the draft was no longer there to claim.
 */
async function promoteModuleVersion(
  tx: Tx,
  input: { moduleId: string; versionId: string; publishedAt: Date; actorId: string },
): Promise<boolean> {
  const claimed = await tx.approvalModuleVersion.updateMany({
    where: { id: input.versionId, status: "draft" },
    data: { status: "published", publishedAt: input.publishedAt, publishedBy: input.actorId },
  });
  if (claimed.count !== 1) return false;

  await tx.approvalModuleVersion.updateMany({
    where: { moduleId: input.moduleId, status: "published", id: { not: input.versionId } },
    data: { status: "superseded" },
  });
  await tx.approvalModule.update({
    where: { id: input.moduleId },
    data: { publishedVersionId: input.versionId },
  });
  return true;
}
