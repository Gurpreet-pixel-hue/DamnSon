import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
} from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import { analyzeJourney } from "@/lib/contract/analyze";
import {
  deriveStepStates,
  nextUpStepIds,
  canMarkDone,
  computeProgressCount,
} from "./progress";
import { fromJourney } from "./viewModel";

function loadExampleStartupJourney() {
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
  const journey = composeJourney(template, modules, facts);
  return { template, modules, facts, journey };
}

describe("progress derivations on ComposedJourney", () => {
  it("orders steps deterministically in analyzeJourney order", () => {
    const { journey } = loadExampleStartupJourney();
    const analysis = analyzeJourney(journey);

    expect(analysis.ok).toBe(true);
    expect(analysis.order).toEqual([
      "ex-directors.kyc.1",
      "ex-directors.kyc.2",
      "ex-incorporation.file",
      "ex-incorporation.incorporated",
      "ex-banking.open-account",
      "ex-food.apply",
      "ex-recognition.apply",
      "ex-local.intimation",
      "ex-local.display",
    ]);
  });

  it("handles completed none: kyc.1 and kyc.2 available, rest locked", () => {
    const { journey } = loadExampleStartupJourney();
    const completed = new Set<string>();

    const states = deriveStepStates(journey, completed);

    expect(states.get("ex-directors.kyc.1")).toBe("available");
    expect(states.get("ex-directors.kyc.2")).toBe("available");
    expect(states.get("ex-incorporation.file")).toBe("locked");
    expect(states.get("ex-incorporation.incorporated")).toBe("locked");
    expect(states.get("ex-banking.open-account")).toBe("locked");
    expect(states.get("ex-food.apply")).toBe("locked");
    expect(states.get("ex-recognition.apply")).toBe("locked");
    expect(states.get("ex-local.intimation")).toBe("locked");
    expect(states.get("ex-local.display")).toBe("locked");

    const nextUp = nextUpStepIds(journey, states);
    expect(nextUp).toEqual(["ex-directors.kyc.1", "ex-directors.kyc.2"]);
  });

  it("handles completed {kyc.1, kyc.2}: file available, rest locked", () => {
    const { journey } = loadExampleStartupJourney();
    const completed = new Set(["ex-directors.kyc.1", "ex-directors.kyc.2"]);

    const states = deriveStepStates(journey, completed);

    expect(states.get("ex-directors.kyc.1")).toBe("done");
    expect(states.get("ex-directors.kyc.2")).toBe("done");
    expect(states.get("ex-incorporation.file")).toBe("available");
    expect(states.get("ex-incorporation.incorporated")).toBe("locked");
    expect(states.get("ex-banking.open-account")).toBe("locked");
    expect(states.get("ex-food.apply")).toBe("locked");
    expect(states.get("ex-recognition.apply")).toBe("locked");
    expect(states.get("ex-local.intimation")).toBe("locked");
    expect(states.get("ex-local.display")).toBe("locked");

    const nextUp = nextUpStepIds(journey, states);
    expect(nextUp).toEqual(["ex-incorporation.file"]);
  });

  it("handles completed {kyc.1, kyc.2, file}: milestone auto-completes and unlocks dependents", () => {
    const { journey } = loadExampleStartupJourney();
    const completed = new Set([
      "ex-directors.kyc.1",
      "ex-directors.kyc.2",
      "ex-incorporation.file",
    ]);

    const states = deriveStepStates(journey, completed);

    expect(states.get("ex-incorporation.incorporated")).toBe("done");
    expect(states.get("ex-banking.open-account")).toBe("available");
    expect(states.get("ex-food.apply")).toBe("available");
    expect(states.get("ex-recognition.apply")).toBe("available");
    expect(states.get("ex-local.intimation")).toBe("available");
    expect(states.get("ex-local.display")).toBe("locked");

    const nextUp = nextUpStepIds(journey, states);
    // ex-recognition.apply is optional, so it is omitted from nextUp
    expect(nextUp).toEqual([
      "ex-banking.open-account",
      "ex-food.apply",
      "ex-local.intimation",
    ]);
  });

  it("guards milestone completion with canMarkDone and ignores milestone in completed", () => {
    expect(canMarkDone("milestone")).toBe(false);
    expect(canMarkDone("government")).toBe(true);
    expect(canMarkDone("non_government")).toBe(true);

    const { journey } = loadExampleStartupJourney();
    // Milestone ID passed in completed when prereqs are not met
    const completed = new Set(["ex-incorporation.incorporated"]);
    const states = deriveStepStates(journey, completed);

    // Should remain locked because milestone requirements are not satisfied
    expect(states.get("ex-incorporation.incorporated")).toBe("locked");
    expect(states.get("ex-incorporation.file")).toBe("locked");
  });

  it("computeProgressCount covers action steps only (PRD §8.8) and excludes milestones", () => {
    // 1. Basic check with synthetic stations
    const stations = [
      { kind: "government" as const, applicability: "applies" as const, state: "done" as const },
      { kind: "non_government" as const, applicability: "applies" as const, state: "available" as const },
      { kind: "milestone" as const, applicability: "applies" as const, state: "done" as const },
      { kind: "government" as const, applicability: "optional" as const, state: "done" as const },
    ];
    const { total, done } = computeProgressCount(stations);
    expect(total).toBe(2);
    expect(done).toBe(1);

    // 2. Demo metro reads "of 11"
    const demoTemplate = journeyTemplateSchema.parse(
      readTemplateFixture("demo-metro-synthetic")
    );
    const demoModules = [
      "demo-identity",
      "demo-incorporation",
      "demo-premises",
      "demo-food",
      "demo-trade",
    ].map((n) => approvalModuleSchema.parse(readModuleFixture(n)));
    const demoJourney = composeJourney(demoTemplate, demoModules, {});
    const demoMetro = fromJourney(demoJourney, new Set());
    const demoCount = computeProgressCount(demoMetro);
    expect(demoCount.total).toBe(11);

    // 3. Stress graph reads "of 24"
    const stressTemplate = journeyTemplateSchema.parse(
      readTemplateFixture("stress-25-synthetic")
    );
    const stressModules = ["stress-alpha", "stress-beta"].map((n) =>
      approvalModuleSchema.parse(readModuleFixture(n))
    );
    const stressJourney = composeJourney(stressTemplate, stressModules, {});
    const stressMetro = fromJourney(stressJourney, new Set());
    const stressCount = computeProgressCount(stressMetro);
    expect(stressCount.total).toBe(24);
  });

  it("gives Company incorporated as locked on real start-business-mumbai with {} facts (PRD 1.3 §8.8)", () => {
    const templatePath = join(process.cwd(), "data/seed/templates/start-business-mumbai.json");
    const template = journeyTemplateSchema.parse(JSON.parse(readFileSync(templatePath, "utf8")));
    const modules = template.modules.map((m) => {
      const modPath = join(process.cwd(), "data/seed/modules", `${m.moduleId}.json`);
      return approvalModuleSchema.parse(JSON.parse(readFileSync(modPath, "utf8")));
    });
    const journey = composeJourney(template, modules, {});
    const states = deriveStepStates(journey, new Set());

    const incStep = journey.steps.find((s) => s.id === "mca-spice-plus.incorporated");
    expect(incStep).toBeDefined();
    expect(incStep?.title).toBe("Company incorporated");
    expect(states.get("mca-spice-plus.incorporated")).toBe("locked");
  });
});
