import { describe, it, expect } from "vitest";
import { checkAllRemainingOnline, deriveSummaryValues } from "./SummaryBar";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
} from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";

function loadTestJourney() {
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
  return composeJourney(template, modules, facts);
}

describe("SummaryBar derivations (visual-direction §8 & §9.1)", () => {
  it("derives all summary values and formatted texts for test journey", () => {
    const journey = loadTestJourney();
    const summary = deriveSummaryValues(journey, new Set());

    expect(summary.nextUpIds.length).toBeGreaterThan(0);
    expect(summary.nextUpText).toContain("Complete director KYC");
    expect(summary.feesText).toContain("₹500–₹1,500");
    expect(summary.timeText).toContain("days");
    expect(summary.officeVisitsText).toBe("2 office visits");
  });

  it("checks all remaining online correctly", () => {
    const journey = loadTestJourney();
    // Test journey has in_person or hybrid steps, so not all online initially
    const allOnlineInitially = checkAllRemainingOnline(journey, new Set());
    // In example-startup, ex-local.display is in_person/physical
    expect(allOnlineInitially).toBe(false);

    // If we mark all in_person steps as done
    const inPersonStepIds = journey.steps
      .filter((s) => s.kind !== "milestone" && s.mode !== "online")
      .map((s) => s.id);

    const allOnlineAfter = checkAllRemainingOnline(journey, new Set(inPersonStepIds));
    expect(allOnlineAfter).toBe(true);
  });
});
