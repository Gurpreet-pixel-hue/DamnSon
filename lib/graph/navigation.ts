export interface NavigationState {
  totalStages: number;
  focusStage: number; // 1-based (1..totalStages)
  currentStage: number; // 1-based
  focusedStepId: string | null;
  selectedStepId: string | null; // non-null means drawer is open
  stageStationIds: string[]; // station IDs in this stage in tray order
}

export type NavigationResult =
  | { type: "SET_STAGE"; stage: number; focusFirstStation: boolean }
  | { type: "FOCUS_STATION"; stepId: string; syncDrawer: boolean }
  | { type: "OPEN_DRAWER"; stepId: string }
  | { type: "TOGGLE_DONE"; stepId: string }
  | { type: "CLOSE_DRAWER" }
  | { type: "RESET_TO_STAGE_OVERVIEW" }
  | { type: "IGNORED" };

/**
 * Pure reducer mapping a keyboard event to a navigation action (§12.1).
 */
export function reduceNavigationKey(
  key: string,
  state: NavigationState
): NavigationResult {
  const { totalStages, focusStage, currentStage, focusedStepId, selectedStepId, stageStationIds } = state;

  switch (key) {
    case "ArrowLeft":
    case "[":
    case "BracketLeft": {
      if (focusStage > 1) {
        return { type: "SET_STAGE", stage: focusStage - 1, focusFirstStation: true };
      }
      return { type: "IGNORED" };
    }

    case "ArrowRight":
    case "]":
    case "BracketRight": {
      if (focusStage < totalStages) {
        return { type: "SET_STAGE", stage: focusStage + 1, focusFirstStation: true };
      }
      return { type: "IGNORED" };
    }

    case "Home": {
      if (focusStage !== 1) {
        return { type: "SET_STAGE", stage: 1, focusFirstStation: true };
      }
      return { type: "IGNORED" };
    }

    case "End": {
      if (focusStage !== totalStages) {
        return { type: "SET_STAGE", stage: totalStages, focusFirstStation: true };
      }
      return { type: "IGNORED" };
    }

    case "c":
    case "C": {
      if (focusStage !== currentStage) {
        return { type: "SET_STAGE", stage: currentStage, focusFirstStation: true };
      }
      return { type: "IGNORED" };
    }

    case "ArrowDown": {
      if (stageStationIds.length === 0) return { type: "IGNORED" };
      const currentIdx = focusedStepId ? stageStationIds.indexOf(focusedStepId) : -1;
      let nextIdx: number;
      if (currentIdx === -1) {
        nextIdx = 0;
      } else {
        nextIdx = Math.min(currentIdx + 1, stageStationIds.length - 1);
      }
      const nextStepId = stageStationIds[nextIdx];
      if (nextStepId) {
        return {
          type: "FOCUS_STATION",
          stepId: nextStepId,
          syncDrawer: Boolean(selectedStepId),
        };
      }
      return { type: "IGNORED" };
    }

    case "ArrowUp": {
      if (stageStationIds.length === 0) return { type: "IGNORED" };
      const currentIdx = focusedStepId ? stageStationIds.indexOf(focusedStepId) : -1;
      let prevIdx: number;
      if (currentIdx === -1) {
        prevIdx = stageStationIds.length - 1;
      } else {
        prevIdx = Math.max(currentIdx - 1, 0);
      }
      const prevStepId = stageStationIds[prevIdx];
      if (prevStepId) {
        return {
          type: "FOCUS_STATION",
          stepId: prevStepId,
          syncDrawer: Boolean(selectedStepId),
        };
      }
      return { type: "IGNORED" };
    }

    case "Enter": {
      if (focusedStepId) {
        return { type: "OPEN_DRAWER", stepId: focusedStepId };
      }
      return { type: "IGNORED" };
    }

    case " ":
    case "Space": {
      if (focusedStepId) {
        return { type: "TOGGLE_DONE", stepId: focusedStepId };
      }
      return { type: "IGNORED" };
    }

    case "Escape": {
      if (selectedStepId) {
        return { type: "CLOSE_DRAWER" };
      }
      return { type: "RESET_TO_STAGE_OVERVIEW" };
    }

    default:
      return { type: "IGNORED" };
  }
}

export interface AnnouncementParams {
  stageNumber: number;
  totalStages: number;
  stageName: string;
  totalStepsInStage: number;
  stationNumber?: number; // 1-based index within stage
  stationTitle?: string;
  stationState?: string;
}

/**
 * Formats screen-reader announcement for navigation (§12.1).
 * Example: "Stage 4 of 7, In parallel, 15 steps. Step 3 of 15: Apply for GST registration, available"
 */
export function formatNavigationAnnouncement(params: AnnouncementParams): string {
  const stagePart = `Stage ${params.stageNumber} of ${params.totalStages}, ${params.stageName}, ${params.totalStepsInStage} steps.`;
  if (params.stationNumber && params.stationTitle && params.stationState) {
    return `${stagePart} Step ${params.stationNumber} of ${params.totalStepsInStage}: ${params.stationTitle}, ${params.stationState}`;
  }
  return stagePart;
}
