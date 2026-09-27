import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
} from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import {
  toCalendarDays,
  summarizeFees,
  summarizeTime,
} from "./totals";

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
  return { journey };
}

describe("totals derivations on ComposedJourney", () => {
  it("converts working days to calendar days correctly", () => {
    expect(toCalendarDays(1, "working")).toBe(2);
    expect(toCalendarDays(2, "working")).toBe(3);
    expect(toCalendarDays(5, "working")).toBe(7);
    expect(toCalendarDays(10, "calendar")).toBe(10);
  });

  describe("summarizeFees", () => {
    it("computes fee summary when no steps are completed", () => {
      const { journey } = loadExampleStartupJourney();
      const summary = summarizeFees(journey, new Set());

      expect(summary).toEqual({
        minINR: 500,
        maxINR: 1500,
        unconfirmedCount: 2,
        mayApplyCount: 1,
      });
    });

    it("computes fee summary when incorporation file is completed", () => {
      const { journey } = loadExampleStartupJourney();
      const completed = new Set([
        "ex-directors.kyc.1",
        "ex-directors.kyc.2",
        "ex-incorporation.file",
      ]);
      const summary = summarizeFees(journey, completed);

      expect(summary).toEqual({
        minINR: 0,
        maxINR: 0,
        unconfirmedCount: 2,
        mayApplyCount: 1,
      });
    });
  });

  describe("summarizeTime", () => {
    const expectedCriticalStepIds = [
      "ex-directors.kyc.1",
      "ex-incorporation.file",
      "ex-incorporation.incorporated",
      "ex-food.apply",
    ];

    it("computes time summary when no steps are completed", () => {
      const { journey } = loadExampleStartupJourney();
      const summary = summarizeTime(journey, new Set());

      expect(summary.criticalStepIds).toEqual(expectedCriticalStepIds);
      expect(summary).toEqual({
        minDays: 2,
        maxDays: 9,
        openEnded: true,
        unknownCount: 2,
        criticalStepIds: expectedCriticalStepIds,
        relativeTo: "ex-incorporation.file",
        relative: {
          minDays: 2,
          maxDays: 7,
          openEnded: true,
        },
      });
    });

    it("computes time summary when kyc steps are completed", () => {
      const { journey } = loadExampleStartupJourney();
      const completed = new Set(["ex-directors.kyc.1", "ex-directors.kyc.2"]);
      const summary = summarizeTime(journey, completed);

      expect(summary.criticalStepIds).toEqual(expectedCriticalStepIds);
      expect(summary).toEqual({
        minDays: 2,
        maxDays: 7,
        openEnded: true,
        unknownCount: 2,
        criticalStepIds: expectedCriticalStepIds,
        relativeTo: "ex-incorporation.file",
        relative: {
          minDays: 2,
          maxDays: 7,
          openEnded: true,
        },
      });
    });

    it("computes time summary when incorporation is completed", () => {
      const { journey } = loadExampleStartupJourney();
      const completed = new Set([
        "ex-directors.kyc.1",
        "ex-directors.kyc.2",
        "ex-incorporation.file",
      ]);
      const summary = summarizeTime(journey, completed);

      expect(summary.criticalStepIds).toEqual(expectedCriticalStepIds);
      expect(summary).toEqual({
        minDays: 2,
        maxDays: 7,
        openEnded: true,
        unknownCount: 2,
        criticalStepIds: expectedCriticalStepIds,
        relativeTo: null,
      });
      expect(summary.relative).toBeUndefined();
    });
  });
});
