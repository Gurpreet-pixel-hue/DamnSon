import { describe, it, expect } from "vitest";
import { summarizeVerification } from "./VerificationBanner";
import type { ComposedJourney } from "@/lib/contract/compose";

describe("summarizeVerification (P2 & §8.8)", () => {
  it("returns zero counts and isPartiallyVerified=false when all action steps are verified", () => {
    const journey: ComposedJourney = {
      template: {
        id: "test",
        title: "Test",
        jurisdiction: { state: "MH", city: "Mumbai" },
        task: "test",
      } as any,
      steps: [
        {
          id: "step-1",
          title: "Step 1",
          kind: "government",
          requirement: { kind: "mandatory" },
          applicability: "applies",
          mode: "online",
          review: { status: "verified", verifiedOn: "2026-09-01" },
        } as any,
        {
          id: "ms-1",
          title: "Milestone 1",
          kind: "milestone",
          requirement: { kind: "mandatory" },
          applicability: "applies",
        } as any,
      ],
      edges: [],
    };

    const summary = summarizeVerification(journey);
    expect(summary.unverifiedCount).toBe(0);
    expect(summary.flaggedCount).toBe(0);
    expect(summary.isPartiallyVerified).toBe(false);
  });

  it("counts unverified action steps separately and ignores milestones", () => {
    const journey: ComposedJourney = {
      template: {} as any,
      steps: [
        {
          id: "step-1",
          kind: "government",
          review: { status: "unverified" },
        } as any,
        {
          id: "step-2",
          kind: "government",
          review: { status: "unverified" },
        } as any,
        {
          id: "ms-1",
          kind: "milestone",
          // Milestone does not have review status
        } as any,
      ],
      edges: [],
    };

    const summary = summarizeVerification(journey);
    expect(summary.unverifiedCount).toBe(2);
    expect(summary.flaggedCount).toBe(0);
    expect(summary.isPartiallyVerified).toBe(true);
  });

  it("counts flagged action steps separately and identifies partial verification", () => {
    const journey: ComposedJourney = {
      template: {} as any,
      steps: [
        {
          id: "step-1",
          kind: "government",
          review: { status: "flagged", note: "Fee structure updated in August" },
        } as any,
        {
          id: "step-2",
          kind: "government",
          review: { status: "verified", verifiedOn: "2026-09-01" },
        } as any,
      ],
      edges: [],
    };

    const summary = summarizeVerification(journey);
    expect(summary.unverifiedCount).toBe(0);
    expect(summary.flaggedCount).toBe(1);
    expect(summary.isPartiallyVerified).toBe(true);
  });

  it("handles both unverified and flagged steps together", () => {
    const journey: ComposedJourney = {
      template: {} as any,
      steps: [
        {
          id: "step-1",
          kind: "government",
          review: { status: "unverified" },
        } as any,
        {
          id: "step-2",
          kind: "government",
          review: { status: "flagged", note: "Under review" },
        } as any,
        {
          id: "step-3",
          kind: "non_government",
          review: { status: "verified", verifiedOn: "2026-09-01" },
        } as any,
      ],
      edges: [],
    };

    const summary = summarizeVerification(journey);
    expect(summary.unverifiedCount).toBe(1);
    expect(summary.flaggedCount).toBe(1);
    expect(summary.isPartiallyVerified).toBe(true);
  });
});
