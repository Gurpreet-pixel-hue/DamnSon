import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
  type JourneyTemplate,
} from "@/lib/contract/schema";
import { safeCompose } from "./safeCompose";

describe("safeCompose helper", () => {
  it("successfully composes and analyzes valid template and modules", () => {
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
    const facts = {
      "business.sector": "it_saas",
      "company.founders_count": 2,
      "employees.count": 5,
    };

    const result = safeCompose(template, modules, facts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.journey.steps.length).toBe(9);
    }
  });

  it("handles missing module error gracefully by returning error codes per C2", () => {
    const template = journeyTemplateSchema.parse(
      readTemplateFixture("example-startup")
    );
    // Provide an incomplete module list (missing ex-incorporation)
    const moduleNames = ["ex-directors", "ex-banking"];
    const modules = moduleNames.map((name) =>
      approvalModuleSchema.parse(readModuleFixture(name))
    );

    const result = safeCompose(template, modules, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.codes).toContain("COMPOSE_ERROR");
      expect(result.message).toBeDefined();
      expect(result.message).toContain("ex-incorporation");
    }
  });

  it("handles analyzeJourney failure gracefully by returning graph error codes", () => {
    const templateRaw = readTemplateFixture("example-startup");
    const template = journeyTemplateSchema.parse(templateRaw);
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

    // Create a modified template with a cycle across modules
    const cyclicTemplate: JourneyTemplate = {
      ...template,
      links: [
        ...template.links,
        {
          id: "l-cycle-back",
          fromModule: "ex-local",
          toModule: "ex-directors",
          kind: "requires",
        },
      ],
    };

    const result = safeCompose(cyclicTemplate, modules, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.codes).toContain("CYCLE");
    }
  });
});
