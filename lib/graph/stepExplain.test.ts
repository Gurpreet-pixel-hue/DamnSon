import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import { journeyTemplateSchema, approvalModuleSchema } from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import { explainStep } from "./stepExplain";

const template = journeyTemplateSchema.parse(readTemplateFixture("example-startup"));
const modules = ["ex-directors", "ex-incorporation", "ex-banking", "ex-tax", "ex-food", "ex-recognition", "ex-local"].map(
  (name) => approvalModuleSchema.parse(readModuleFixture(name))
);
const journey = composeJourney(template, modules, {
  "business.sector": "it_saas",
  "company.founders_count": 2,
  "employees.count": 5,
});

describe("explainStep", () => {
  it("returns null for an unknown step", () => {
    expect(explainStep(journey, "ghost.step")).toBeNull();
  });

  it("lists what a step depends on and what it unlocks, from the journey's edges", () => {
    const e = explainStep(journey, "ex-incorporation.file");
    expect(e).not.toBeNull();
    expect(e?.dependsOn.map((d) => d.id).sort()).toEqual(["ex-directors.kyc.1", "ex-directors.kyc.2"]);
    expect(e?.dependsOn.every((d) => d.kind === "requires")).toBe(true);
    expect(e?.unlocks.map((u) => u.id)).toEqual(["ex-incorporation.incorporated"]);
  });

  it("gives the condition as the reason a conditional step applies", () => {
    const e = explainStep(journey, "ex-local.intimation");
    expect(e?.appliesBecause).toEqual(["Fewer than 10 workers"]);
    expect(e?.applicability).toBe("applies");
  });

  it("puts hard prerequisites before suggested order", () => {
    for (const step of journey.steps) {
      const e = explainStep(journey, step.id);
      const kinds = e?.dependsOn.map((d) => d.kind) ?? [];
      expect(kinds).toEqual([...kinds].sort((a, b) => (a === b ? 0 : a === "requires" ? -1 : 1)));
    }
  });
});
