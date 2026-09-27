import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishedJourneyResponseSchema, templateSummarySchema } from "@/lib/contract/api";
import { readModuleFixture, readTemplateFixture } from "@/data/fixtures/v3/loadFixture";
import { approvalModuleSchema, journeyTemplateSchema } from "@/lib/contract/schema";
import { getPrisma } from "../db/client";
import { createDbJourneyRepository } from "./dbRepository";
import { getJourneyRepository } from "./index";

const previous = process.env["DATA_SOURCE"];
afterEach(() => {
  vi.restoreAllMocks();
  if (previous === undefined) delete process.env["DATA_SOURCE"];
  else process.env["DATA_SOURCE"] = previous;
});

describe("getJourneyRepository", () => {
  it("selects the database repository without connecting to anything", () => {
    process.env["DATA_SOURCE"] = "db";
    expect(() => getJourneyRepository()).not.toThrow();
  });

  it("rejects a DATA_SOURCE it does not know", () => {
    process.env["DATA_SOURCE"] = "mysql";
    expect(() => getJourneyRepository()).toThrow(/must be "files", "fixtures" or "db"/);
  });

  it("defaults to files", () => {
    delete process.env["DATA_SOURCE"];
    expect(() => getJourneyRepository()).not.toThrow();
  });
});

describe("createDbJourneyRepository without DATABASE_URL", () => {
  it("fails on use, not on construction, so DATA_SOURCE=files never needs a connection string", async () => {
    const url = process.env["DATABASE_URL"];
    delete process.env["DATABASE_URL"];
    try {
      const repository = createDbJourneyRepository();
      await expect(repository.listTemplates()).rejects.toThrow(/DATABASE_URL is not set/);
    } finally {
      if (url !== undefined) process.env["DATABASE_URL"] = url;
    }
  });
});

// Integration: only runs when a database is configured, so CI and other lanes stay green without one.
const hasDatabase = (process.env["DATABASE_URL"] ?? "").length > 0;
describe.skipIf(!hasDatabase)("createDbJourneyRepository against a real database", () => {
  beforeEach(() => {
    process.env["DATA_SOURCE"] = "db";
  });

  it("lists published templates that satisfy the contract", async () => {
    const templates = await createDbJourneyRepository().listTemplates();
    for (const template of templates) expect(() => templateSummarySchema.parse(template)).not.toThrow();
  });

  it("round-trips a published journey, or returns null when nothing is seeded", async () => {
    const repository = createDbJourneyRepository();
    const [first] = await repository.listTemplates();
    if (first === undefined) return; // an empty database is a valid state before npm run seed
    const journey = await repository.getPublishedJourney(first.taskId);
    expect(journey).not.toBeNull();
    expect(() => publishedJourneyResponseSchema.parse(journey)).not.toThrow();
    expect(journey?.modules).toHaveLength(journey?.template.modules.length ?? -1);
  });

  it("returns null for an id that is not published", async () => {
    await expect(createDbJourneyRepository().getPublishedJourney("no-such-journey")).resolves.toBeNull();
  });

  // Regression: readPinnedModules had no status filter, so a template pinning a version that was
  // still a draft served unreviewed content straight to citizens, past the §6.4 human gate.
  describe("a template that pins a draft", () => {
    const MODULE = "zz-draft-only-test";
    const TASK = "zz-draft-pin-test";

    beforeEach(async () => {
      const prisma = getPrisma();
      const module_ = approvalModuleSchema.parse({ ...readModuleFixture("ex-tax"), moduleId: MODULE, version: 1 });
      const template = journeyTemplateSchema.parse({
        ...readTemplateFixture("example-startup"),
        taskId: TASK,
        revision: 1,
        modules: [{ moduleId: MODULE, version: 1, requirement: "mandatory", activation: null, reason: "Draft pin regression test" }],
        links: [],
        questions: [],
      });

      await prisma.approvalModuleVersion.create({
        data: {
          module: { create: { id: MODULE, title: module_.title, authoritySlug: module_.authority.slug } },
          version: 1,
          content: JSON.parse(JSON.stringify(module_)),
          contentHash: "d".repeat(64),
          status: "draft", // never reviewed, never published
        },
      });
      const revision = await prisma.journeyTemplateRevision.create({
        data: {
          template: { create: { id: TASK, title: template.title, category: template.category, keywords: [] } },
          revision: 1,
          content: JSON.parse(JSON.stringify(template)),
          contentHash: "e".repeat(64),
          status: "published",
          publishedAt: new Date(),
        },
        select: { id: true },
      });
      await prisma.journeyTemplate.update({ where: { id: TASK }, data: { publishedRevisionId: revision.id } });
    });

    afterEach(async () => {
      const prisma = getPrisma();
      await prisma.journeyTemplate.updateMany({ where: { id: TASK }, data: { publishedRevisionId: null } });
      await prisma.journeyTemplateRevision.updateMany({ where: { templateId: TASK }, data: { status: "draft" } });
      await prisma.journeyTemplateRevision.deleteMany({ where: { templateId: TASK } });
      await prisma.journeyTemplate.deleteMany({ where: { id: TASK } });
      await prisma.approvalModuleVersion.deleteMany({ where: { moduleId: MODULE } });
      await prisma.approvalModule.deleteMany({ where: { id: MODULE } });
    });

    it("is not served, rather than serving unreviewed content", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await expect(createDbJourneyRepository().getPublishedJourney(TASK)).resolves.toBeNull();
    });

    it("is left out of the listing too", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const templates = await createDbJourneyRepository().listTemplates();
      expect(templates.map((t) => t.taskId)).not.toContain(TASK);
    });
  });
});
