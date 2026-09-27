import { describe, it, expect } from "vitest";
import { loadJourneyPage, type JourneyRepository } from "./loadJourneyPage";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
} from "@/lib/contract/schema";

function createValidPublishedResponse() {
  const template = journeyTemplateSchema.parse(
    readTemplateFixture("example-startup")
  );
  const moduleNames = [
    "ex-directors",
    "ex-incorporation",
    "ex-banking",
    "ex-tax",
    "ex-food",
    "ex-recognition",
    "ex-local",
  ];
  const modules = moduleNames.map((name) =>
    approvalModuleSchema.parse(readModuleFixture(name))
  );

  return {
    template,
    modules,
    publishedAt: new Date().toISOString(),
  };
}

describe("loadJourneyPage (P8 & §11.2)", () => {
  it("returns kind: ok when repository finds valid published journey", async () => {
    const valid = createValidPublishedResponse();
    const fakeRepo: JourneyRepository = {
      listTemplates: async () => [],
      getPublishedJourney: async (id) => (id === "example-startup" ? valid : null),
    };

    const result = await loadJourneyPage(fakeRepo, "example-startup");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data.journey.steps.length).toBeGreaterThan(0);
      expect(result.data.published.template.taskId).toBe("example-startup");
    }
  });

  it("returns kind: not_found when repository returns null", async () => {
    const fakeRepo: JourneyRepository = {
      listTemplates: async () => [],
      getPublishedJourney: async () => null,
    };

    const result = await loadJourneyPage(fakeRepo, "non-existent-task");
    expect(result.kind).toBe("not_found");
  });

  it("returns kind: invalid when journey composition fails or has broken graph (replaces ?graph=broken)", async () => {
    const valid = createValidPublishedResponse();
    // Simulate broken graph by removing all modules referenced by pins
    const broken = {
      ...valid,
      modules: [], // empty modules causes compose error: UNKNOWN_MODULE
    };

    const fakeRepo: JourneyRepository = {
      listTemplates: async () => [],
      getPublishedJourney: async () => broken,
    };

    const result = await loadJourneyPage(fakeRepo, "broken-graph-task");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});
