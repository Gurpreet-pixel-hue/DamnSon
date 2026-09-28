import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import { journeyTemplateSchema, approvalModuleSchema } from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import type { Facts } from "@/lib/contract/facts";
import { diffJourneys, formatDiff } from "./journeyDiff";

const template = journeyTemplateSchema.parse(readTemplateFixture("example-startup"));
const modules = [
  "ex-directors",
  "ex-incorporation",
  "ex-banking",
  "ex-tax",
  "ex-food",
  "ex-recognition",
  "ex-local",
].map((name) => approvalModuleSchema.parse(readModuleFixture(name)));

const compose = (facts: Facts) => composeJourney(template, modules, facts);
const A: Facts = {
  "business.sector": "it_saas",
  "company.founders_count": 2,
  "employees.count": 5,
};

describe("diffJourneys", () => {
  it("reports no change for the same facts", () => {
    const diff = diffJourneys(compose(A), compose(A));
    expect(diff).toEqual({ added: [], removed: [], confirmed: [] });
    expect(formatDiff(diff)).toBe("");
  });

  it("swaps intimation for registration at 10 or more workers, with the official reason", () => {
    const diff = diffJourneys(compose(A), compose({ ...A, "employees.count": 12 }));
    expect(diff).toEqual({
      added: [{ title: "Apply for registration", count: 1, stepIds: ["ex-local.registration"] }],
      removed: [
        {
          title: "File an intimation",
          count: 1,
          stepIds: ["ex-local.intimation"],
          reason: "Fewer than 10 workers",
        },
      ],
      confirmed: [],
    });
    expect(formatDiff(diff)).toBe("+1 station, −1 station");
  });

  it("adds a repeated station when a founder is added (no reason needed)", () => {
    const diff = diffJourneys(compose(A), compose({ ...A, "company.founders_count": 3 }));
    expect(diff.added).toEqual([
      { title: "Complete director KYC (Founder 3)", count: 1, stepIds: ["ex-directors.kyc.3"] },
    ]);
    expect(diff.removed).toEqual([]);
  });

  it("groups repeated stations with count > 1 into a single entry without repeat suffix (founders 1 -> 3)", () => {
    const from1 = compose({ ...A, "company.founders_count": 1 });
    const to3 = compose({ ...A, "company.founders_count": 3 });
    const diff = diffJourneys(from1, to3);
    expect(diff.added).toEqual([
      {
        title: "Complete director KYC",
        count: 2,
        stepIds: ["ex-directors.kyc.2", "ex-directors.kyc.3"],
      },
    ]);
    expect(diff.removed).toEqual([]);
    expect(formatDiff(diff)).toBe("+2 stations");
  });

  it("gives the module's reason when a whole module is switched off", () => {
    const withFood = compose(A);
    const noFood = compose({ ...A, "business.serves_food": false });
    const diff = diffJourneys(withFood, noFood);
    const foodModule = noFood.excluded.find((e) => e.kind === "module" && e.moduleId === "ex-food");
    expect(foodModule).toBeDefined();
    expect(diff.removed.length).toBeGreaterThan(0);
    for (const change of diff.removed) {
      expect(change.stepIds.every((id) => id.startsWith("ex-food."))).toBe(true);
      expect(change.reason).toBe(foodModule?.reason);
    }
    expect(
      diffJourneys(noFood, withFood).added.flatMap((c) => c.stepIds)
    ).toEqual(diff.removed.flatMap((c) => c.stepIds));
  });

  it("reports stations that move from 'may apply' to applies", () => {
    const before = compose(A);
    const after = compose({ ...A, "business.serves_food": true });
    const diff = diffJourneys(before, after);
    const foodIds = before.steps.filter((s) => s.moduleId === "ex-food").map((s) => s.id);
    expect(foodIds.length).toBeGreaterThan(0);
    expect(
      before.steps
        .filter((s) => s.moduleId === "ex-food")
        .every((s) => s.applicability === "may_apply")
    ).toBe(true);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.confirmed.flatMap((c) => c.stepIds)).toEqual(foodIds);
    expect(formatDiff(diff)).toBe(`${foodIds.length} now ${foodIds.length === 1 ? "applies" : "apply"}`);
  });
});
