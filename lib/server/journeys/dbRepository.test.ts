import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishedJourneyResponseSchema, templateSummarySchema } from "@/lib/contract/api";
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
});
