import { describe, it, expect } from "vitest";
import { selectLandingMatches } from "./matchSelection";
import type { TemplateSummary } from "@/lib/contract/api";

describe("selectLandingMatches", () => {
  const dummyTemplate = (taskId: string, title: string): TemplateSummary => ({
    taskId,
    revision: 1,
    category: "business_and_trade",
    title,
    summary: "Summary for " + title,
    jurisdiction: { state: "MH", city: "Mumbai" },
    stepCount: 10,
    verifiedStepCount: 8,
    keywords: ["business", "test"],
    questionFacts: ["business.entity_type"],
  });

  it("handles empty matches list", () => {
    const res = selectLandingMatches([]);
    expect(res.matches).toEqual([]);
    expect(res.selectedMatch).toBeNull();
    expect(res.hasSingleMatch).toBe(false);
    expect(res.hasMultipleMatches).toBe(false);
  });

  it("handles single match and marks as best match", () => {
    const m = dummyTemplate("t1", "Start a Business");
    const res = selectLandingMatches([m]);
    expect(res.matches.length).toBe(1);
    expect(res.matches[0]?.isBestMatch).toBe(true);
    expect(res.selectedMatch?.taskId).toBe("t1");
    expect(res.hasSingleMatch).toBe(true);
    expect(res.hasMultipleMatches).toBe(false);
  });

  it("limits to top 3 matches and selects requested taskId", () => {
    const m1 = dummyTemplate("t1", "Template 1");
    const m2 = dummyTemplate("t2", "Template 2");
    const m3 = dummyTemplate("t3", "Template 3");
    const m4 = dummyTemplate("t4", "Template 4");

    const res = selectLandingMatches([m1, m2, m3, m4], "t2");
    expect(res.matches.length).toBe(3);
    expect(res.matches.map((m) => m.taskId)).toEqual(["t1", "t2", "t3"]);
    expect(res.matches[0]?.isBestMatch).toBe(true);
    expect(res.matches[1]?.isBestMatch).toBe(false);
    expect(res.selectedMatch?.taskId).toBe("t2");
    expect(res.hasMultipleMatches).toBe(true);
  });
});
