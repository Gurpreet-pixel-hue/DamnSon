import { describe, it, expect } from "vitest";
import { summarizeVerification } from "./VerificationBanner";
import type { ComposedJourney, ComposedActionStep, ComposedMilestone } from "@/lib/contract/compose";

function makeMockActionStep(
  id: string,
  status: "unverified" | "verified" | "flagged",
  note?: string
): ComposedActionStep {
  return {
    id,
    moduleId: "mod",
    title: id,
    kind: "government",
    department: "Dept",
    authoritySlug: "auth",
    officeType: "online_portal",
    requirement: { kind: "mandatory" },
    applicability: "applies",
    mode: "online",
    fee: { kind: "free" },
    timeline: { officialSla: { kind: "unknown" }, conditional: [] },
    review: {
      status,
      ...(status === "verified" ? { verifiedOn: "2026-09-01" } : {}),
      ...(note ? { note } : {}),
    },
    documents: [],
    forms: [],
    layer: 0,
    lane: 0,
    x: 0,
    y: 0,
  };
}

function makeMockMilestone(id: string): ComposedMilestone {
  return {
    id,
    moduleId: "mod",
    title: id,
    kind: "milestone",
    requirement: { kind: "mandatory" },
    applicability: "applies",
    layer: 0,
    lane: 0,
    x: 0,
    y: 0,
  };
}

describe("summarizeVerification (P2 & §8.8)", () => {
  it("returns zero counts and isPartiallyVerified=false when all action steps are verified", () => {
    const journey: ComposedJourney = {
      taskId: "test",
      revision: 1,
      title: "Test",
      summary: "Test",
      jurisdiction: { country: "IN", state: "MH", city: "Mumbai" },
      category: "business_and_trade",
      facts: {},
      excluded: [],
      questions: [],
      steps: [
        makeMockActionStep("step-1", "verified"),
        makeMockMilestone("ms-1"),
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
      taskId: "test",
      revision: 1,
      title: "Test",
      summary: "",
      jurisdiction: { country: "IN", state: "MH" },
      category: "business_and_trade",
      facts: {},
      excluded: [],
      questions: [],
      steps: [
        makeMockActionStep("step-1", "unverified"),
        makeMockActionStep("step-2", "unverified"),
        makeMockMilestone("ms-1"),
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
      taskId: "test",
      revision: 1,
      title: "Test",
      summary: "",
      jurisdiction: { country: "IN", state: "MH" },
      category: "business_and_trade",
      facts: {},
      excluded: [],
      questions: [],
      steps: [
        makeMockActionStep("step-1", "flagged", "Fee structure updated in August"),
        makeMockActionStep("step-2", "verified"),
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
      taskId: "test",
      revision: 1,
      title: "Test",
      summary: "",
      jurisdiction: { country: "IN", state: "MH" },
      category: "business_and_trade",
      facts: {},
      excluded: [],
      questions: [],
      steps: [
        makeMockActionStep("step-1", "unverified"),
        makeMockActionStep("step-2", "flagged", "Under review"),
        makeMockActionStep("step-3", "verified"),
      ],
      edges: [],
    };

    const summary = summarizeVerification(journey);
    expect(summary.unverifiedCount).toBe(1);
    expect(summary.flaggedCount).toBe(1);
    expect(summary.isPartiallyVerified).toBe(true);
  });
});
