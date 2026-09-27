import { describe, it, expect } from "vitest";
import {
  reduceNavigationKey,
  formatNavigationAnnouncement,
  type NavigationState,
} from "./navigation";

describe("reduceNavigationKey (§12.1)", () => {
  const baseState: NavigationState = {
    totalStages: 7,
    focusStage: 4,
    currentStage: 2,
    focusedStepId: "step-4-2",
    selectedStepId: null,
    stageStationIds: ["step-4-1", "step-4-2", "step-4-3"],
  };

  it("navigates stages with ArrowLeft / ArrowRight / [ / ]", () => {
    expect(reduceNavigationKey("ArrowLeft", baseState)).toEqual({
      type: "SET_STAGE",
      stage: 3,
      focusFirstStation: true,
    });
    expect(reduceNavigationKey("[", baseState)).toEqual({
      type: "SET_STAGE",
      stage: 3,
      focusFirstStation: true,
    });
    expect(reduceNavigationKey("ArrowRight", baseState)).toEqual({
      type: "SET_STAGE",
      stage: 5,
      focusFirstStation: true,
    });
    expect(reduceNavigationKey("]", baseState)).toEqual({
      type: "SET_STAGE",
      stage: 5,
      focusFirstStation: true,
    });
  });

  it("clamps stage boundaries for ArrowLeft and ArrowRight", () => {
    expect(reduceNavigationKey("ArrowLeft", { ...baseState, focusStage: 1 })).toEqual({
      type: "IGNORED",
    });
    expect(reduceNavigationKey("ArrowRight", { ...baseState, focusStage: 7 })).toEqual({
      type: "IGNORED",
    });
  });

  it("handles Home, End, and C (back to current stage)", () => {
    expect(reduceNavigationKey("Home", baseState)).toEqual({
      type: "SET_STAGE",
      stage: 1,
      focusFirstStation: true,
    });
    expect(reduceNavigationKey("End", baseState)).toEqual({
      type: "SET_STAGE",
      stage: 7,
      focusFirstStation: true,
    });
    expect(reduceNavigationKey("c", baseState)).toEqual({
      type: "SET_STAGE",
      stage: 2,
      focusFirstStation: true,
    });
    expect(reduceNavigationKey("C", baseState)).toEqual({
      type: "SET_STAGE",
      stage: 2,
      focusFirstStation: true,
    });
  });

  it("navigates stations within stage with ArrowUp / ArrowDown in tray order", () => {
    // Current is step-4-2 (idx 1). ArrowDown -> step-4-3 (idx 2)
    expect(reduceNavigationKey("ArrowDown", baseState)).toEqual({
      type: "FOCUS_STATION",
      stepId: "step-4-3",
      syncDrawer: false,
    });

    // ArrowUp -> step-4-1 (idx 0)
    expect(reduceNavigationKey("ArrowUp", baseState)).toEqual({
      type: "FOCUS_STATION",
      stepId: "step-4-1",
      syncDrawer: false,
    });

    // ArrowDown at end of list clamps to end
    expect(
      reduceNavigationKey("ArrowDown", {
        ...baseState,
        focusedStepId: "step-4-3",
      })
    ).toEqual({
      type: "FOCUS_STATION",
      stepId: "step-4-3",
      syncDrawer: false,
    });
  });

  it("syncs drawer when selectedStepId is non-null during ArrowUp/Down", () => {
    expect(
      reduceNavigationKey("ArrowDown", {
        ...baseState,
        selectedStepId: "step-4-2",
      })
    ).toEqual({
      type: "FOCUS_STATION",
      stepId: "step-4-3",
      syncDrawer: true,
    });
  });

  it("Enter opens drawer for focused station", () => {
    expect(reduceNavigationKey("Enter", baseState)).toEqual({
      type: "OPEN_DRAWER",
      stepId: "step-4-2",
    });
    expect(reduceNavigationKey("Enter", { ...baseState, focusedStepId: null })).toEqual({
      type: "IGNORED",
    });
  });

  it("Space toggles done for focused station", () => {
    expect(reduceNavigationKey(" ", baseState)).toEqual({
      type: "TOGGLE_DONE",
      stepId: "step-4-2",
    });
    expect(reduceNavigationKey("Space", baseState)).toEqual({
      type: "TOGGLE_DONE",
      stepId: "step-4-2",
    });
  });

  it("Escape closes drawer if open, else resets to stage overview", () => {
    // Drawer open
    expect(
      reduceNavigationKey("Escape", {
        ...baseState,
        selectedStepId: "step-4-2",
      })
    ).toEqual({
      type: "CLOSE_DRAWER",
    });

    // Drawer closed: resets to stage overview
    expect(reduceNavigationKey("Escape", baseState)).toEqual({
      type: "RESET_TO_STAGE_OVERVIEW",
    });
  });
});

describe("formatNavigationAnnouncement (§12.1)", () => {
  it("formats full announcement with station details", () => {
    const text = formatNavigationAnnouncement({
      stageNumber: 4,
      totalStages: 7,
      stageName: "In parallel",
      totalStepsInStage: 15,
      stationNumber: 3,
      stationTitle: "Apply for GST registration",
      stationState: "available",
    });
    expect(text).toBe(
      "Stage 4 of 7, In parallel, 15 steps. Step 3 of 15: Apply for GST registration, available"
    );
  });

  it("formats stage-only announcement", () => {
    const text = formatNavigationAnnouncement({
      stageNumber: 1,
      totalStages: 7,
      stageName: "Start here",
      totalStepsInStage: 1,
    });
    expect(text).toBe("Stage 1 of 7, Start here, 1 steps.");
  });
});
