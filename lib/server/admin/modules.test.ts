import { afterAll, describe, expect, it } from "vitest";
import { approvalModuleSchema } from "@/lib/contract/schema";
import { readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import { contentHash } from "../contentHash";
import { getPrisma } from "../db/client";
import { saveDraft } from "./modules";

// Runs only with a database, like the other integration tests. It guards a real bug: a draft is stored
// as row version N while the content still said version 1, so a template pinning "<module>@N" could not
// resolve at publish time and publishing failed with UNKNOWN_MODULE. F.2 says the server sets `version`.
const hasDatabase = (process.env["DATABASE_URL"] ?? "").length > 0;
const MODULE_ID = "zz-version-sync-test";
const ACTOR = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!hasDatabase)("saveDraft keeps content.version in step with the row version", () => {
  afterAll(async () => {
    if (!hasDatabase) return;
    const prisma = getPrisma();
    // Drafts delete freely; published rows do not (A.3 trigger). And only one draft may exist at a
    // time, so the existing draft goes first, then the published row is demoted and removed.
    await prisma.approvalModule.updateMany({ where: { id: MODULE_ID }, data: { publishedVersionId: null } });
    await prisma.approvalModuleVersion.deleteMany({ where: { moduleId: MODULE_ID, status: "draft" } });
    await prisma.approvalModuleVersion.updateMany({ where: { moduleId: MODULE_ID }, data: { status: "draft" } });
    await prisma.approvalModuleVersion.deleteMany({ where: { moduleId: MODULE_ID } });
    await prisma.approvalModule.deleteMany({ where: { id: MODULE_ID } });
    // audit_log is append-only by design, so its rows stay.
  });

  it("sets the new draft's version inside the content, not just on the row", async () => {
    const prisma = getPrisma();
    const base = approvalModuleSchema.parse({ ...readModuleFixture("ex-tax"), moduleId: MODULE_ID, version: 1 });
    const baseHash = contentHash(base);

    const published = await prisma.approvalModuleVersion.create({
      data: {
        module: { create: { id: MODULE_ID, title: base.title, authoritySlug: base.authority.slug } },
        version: 1,
        content: JSON.parse(JSON.stringify(base)),
        contentHash: baseHash,
        status: "published",
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.approvalModule.update({ where: { id: MODULE_ID }, data: { publishedVersionId: published.id } });

    const result = await saveDraft(MODULE_ID, { ...base, title: "Edited title" }, baseHash, ACTOR);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe(2);

    const stored = await prisma.approvalModuleVersion.findUnique({
      where: { moduleId_version: { moduleId: MODULE_ID, version: 2 } },
      select: { content: true, contentHash: true, status: true },
    });
    const parsed = approvalModuleSchema.parse(stored?.content);
    expect(parsed.version).toBe(2);
    expect(stored?.status).toBe("draft");
    // The stored hash must be of what is stored, or optimistic concurrency breaks on the next save.
    expect(stored?.contentHash).toBe(contentHash(parsed));
    expect(result.value.contentHash).toBe(stored?.contentHash);
  });

  it("refuses a stale baseHash", async () => {
    const base = approvalModuleSchema.parse({ ...readModuleFixture("ex-tax"), moduleId: MODULE_ID, version: 1 });
    const result = await saveDraft(MODULE_ID, base, "0".repeat(64), ACTOR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("conflict");
  });
});
