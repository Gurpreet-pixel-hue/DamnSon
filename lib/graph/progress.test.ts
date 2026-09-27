import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
  type JourneyTemplate,
  type ApprovalModule,
} from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import { analyzeJourney } from "@/lib/contract/analyze";
import { deriveStepStates, nextUpStepIds, canMarkDone } from "./progress";

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
});
