import { describe, it, expect } from "vitest";
import { formatFees, formatTime, formatNextUp, formatOfficeVisits } from "./summary";
import type { FeeSummary, TimeSummary } from "./totals";
import type { OfficeTrip } from "./trips";

describe("lib/graph/summary", () => {
  describe("formatFees (P5)", () => {
    it("returns 'Free' when all fees, counts and annual fees are 0", () => {
      const summary: FeeSummary = {
        minINR: 0,
        maxINR: 0,
        unconfirmedCount: 0,
        mayApplyCount: 0,
        annualMinINR: 0,
        annualMaxINR: 0,
        annualUnconfirmedCount: 0,
        conditionalMaxINR: 0,
      };
      expect(formatFees(summary)).toBe("Free");
    });

    it("returns '₹0 + 2 fees to confirm' when min/max are 0 but unconfirmed fees exist", () => {
      const summary: FeeSummary = {
        minINR: 0,
        maxINR: 0,
        unconfirmedCount: 2,
        mayApplyCount: 0,
        annualMinINR: 0,
        annualMaxINR: 0,
        annualUnconfirmedCount: 0,
        conditionalMaxINR: 0,
      };
      expect(formatFees(summary)).toBe("₹0 + 2 fees to confirm");
    });

    it("formats fixed fee with may_apply conditional amount", () => {
      const summary: FeeSummary = {
        minINR: 1000,
        maxINR: 1500,
        unconfirmedCount: 0,
        mayApplyCount: 1,
        annualMinINR: 0,
        annualMaxINR: 0,
        annualUnconfirmedCount: 0,
        conditionalMaxINR: 500,
      };
      expect(formatFees(summary)).toBe("₹1,000 (up to ₹500 more if conditions apply)");
    });

    it("formats annual fees separately per year", () => {
      const summary: FeeSummary = {
        minINR: 500,
        maxINR: 500,
        unconfirmedCount: 0,
        mayApplyCount: 0,
        annualMinINR: 200,
        annualMaxINR: 200,
        annualUnconfirmedCount: 0,
        conditionalMaxINR: 0,
      };
      expect(formatFees(summary)).toBe("₹500 + ₹200/yr");
    });

    it("formats fee range with annual fee and unconfirmed fee", () => {
      const summary: FeeSummary = {
        minINR: 500,
        maxINR: 1500,
        unconfirmedCount: 1,
        mayApplyCount: 0,
        annualMinINR: 1000,
        annualMaxINR: 1000,
        annualUnconfirmedCount: 0,
        conditionalMaxINR: 0,
      };
      expect(formatFees(summary)).toBe("₹500–₹1,500 + ₹1,000/yr + 1 fee to confirm");
    });
  });

  describe("formatTime (P1)", () => {
    it("formats basic range with open-ended and relative anchor", () => {
      const summary: TimeSummary = {
        minDays: 2,
        maxDays: 9,
        openEnded: true,
        unknownCount: 0,
        criticalStepIds: ["s1", "s2"],
        relativeTo: "s1",
        relative: {
          minDays: 2,
          maxDays: 7,
          openEnded: true,
        },
      };
      const titles = new Map([["s1", "Company incorporation"]]);
      expect(formatTime(summary, titles)).toBe(
        "2–9 days (open-ended) (2–7 days after Company incorporation)"
      );
    });

    it("formats single day duration", () => {
      const summary: TimeSummary = {
        minDays: 1,
        maxDays: 1,
        openEnded: false,
        unknownCount: 0,
        criticalStepIds: ["s1"],
        relativeTo: null,
      };
      expect(formatTime(summary)).toBe("1 day");
    });

    it("formats immediate / 0 days", () => {
      const summary: TimeSummary = {
        minDays: 0,
        maxDays: 0,
        openEnded: false,
        unknownCount: 0,
        criticalStepIds: [],
        relativeTo: null,
      };
      expect(formatTime(summary)).toBe("Immediate");
    });
  });

  describe("formatNextUp (P6)", () => {
    const titles = new Map([
      ["s1", "Step 1"],
      ["s2", "Step 2"],
      ["s3", "Step 3"],
      ["s4", "Step 4"],
    ]);

    it("returns 'All steps done' when no steps are next", () => {
      expect(formatNextUp([], titles)).toBe("All steps done");
    });

    it("shows 1 step title", () => {
      expect(formatNextUp(["s1"], titles)).toBe("Step 1");
    });

    it("shows 2 step titles", () => {
      expect(formatNextUp(["s1", "s2"], titles)).toBe("Step 1, Step 2");
    });

    it("shows 2 step titles + N more when > 2", () => {
      expect(formatNextUp(["s1", "s2", "s3", "s4"], titles)).toBe(
        "Step 1, Step 2 +2 more"
      );
    });
  });

  describe("formatOfficeVisits (P7)", () => {
    it("returns 'No office visits' when there are no trips and not 100% online", () => {
      expect(formatOfficeVisits([])).toBe("No office visits");
    });

    it("returns '100 % online' only when all remaining steps are online", () => {
      expect(formatOfficeVisits([], { allRemainingOnline: true })).toBe("100 % online");
    });

    it("formats 1 office visit", () => {
      const trips: OfficeTrip[] = [
        {
          key: "hq",
          name: "Municipal HQ",
          officeType: "municipal_hq",
          stepIds: ["s1"],
          mayApply: false,
        },
      ];
      expect(formatOfficeVisits(trips)).toBe("1 office visit");
    });

    it("formats multiple office visits", () => {
      const trips: OfficeTrip[] = [
        {
          key: "hq",
          name: "Municipal HQ",
          officeType: "municipal_hq",
          stepIds: ["s1"],
          mayApply: false,
        },
        {
          key: "ward",
          name: "Ward Office",
          officeType: "ward_office",
          stepIds: ["s2"],
          mayApply: false,
        },
      ];
      expect(formatOfficeVisits(trips)).toBe("2 office visits");
    });
  });
});
