import { describe, it, expect } from "vitest";
import { computeRecomposeDiff, clampFocusStage } from "./recomposeDiff";
import type { ComposedStep } from "@/lib/contract/compose";
import type { MetroVM } from "./viewModel";

function makeFakeStep(id: string, title: string): ComposedStep {
  return {
    id,
    title,
    localId: id,
    moduleId: "mod-1",
    applicability: "applies",
    reasons: [],
    department: "Test Dept",
    kind: "government",
    authoritySlug: "auth-1",
    mode: "online",
    officeType: "online_portal",
    forms: [],
    documents: [],
    outputs: [],
    fee: { kind: "free", sourceRef: "src-1" },
    timeline: { officialSla: { kind: "sla", duration: { minDays: 1, maxDays: 2, dayType: "working" }, sourceRef: "src-1" }, conditional: [] },
    review: { status: "verified", verifiedOn: "2026-09-01" },
    sources: [],
    description: "desc",
    requirement: { kind: "mandatory" },
  };
}

describe("recomposeDiff", () => {
  it("formats added and removed toast with names up to 3 and +N more", () => {
    const s1 = makeFakeStep("s1", "Step One");
    const s2 = makeFakeStep("s2", "Step Two");
    const s3 = makeFakeStep("s3", "Step Three");
    const s4 = makeFakeStep("s4", "Step Four");
    const s5 = makeFakeStep("s5", "Step Five");

    // Added 1, removed 1
    const diff1 = computeRecomposeDiff([s1, s2], [s2, s3]);
    expect(diff1.toastMessage).toBe("Added: Step Three · Removed: Step One");

    // Added 4
    const diff2 = computeRecomposeDiff([s1], [s1, s2, s3, s4, s5]);
    expect(diff2.toastMessage).toBe(
      "Added: Step Two, Step Three, Step Four (+1 more)"
    );

    // No diff
    const diff3 = computeRecomposeDiff([s1, s2], [s1, s2]);
    expect(diff3.toastMessage).toBeNull();
  });

  it("clamps focusStage to currentStage when focused stage index is out of bounds", () => {
    const fakeMetro: MetroVM = {
      stations: [
        {
          id: "s1",
          title: "S1",
          kind: "government",
          officeType: "municipal_hq",
          mode: "in_person",
          state: "available",
          applicability: "applies",
          layer: 0,
          lane: 0,
          position3D: [0, 0, 0],
          position2D: { x: 0, y: 0 },
        },
      ],
      tracks: [],
    };

    // Stage 1 exists. Stage 5 does not exist -> clamps to currentStage (1)
    const clamped = clampFocusStage(5, fakeMetro);
    expect(clamped).toBe(1);
  });
});
