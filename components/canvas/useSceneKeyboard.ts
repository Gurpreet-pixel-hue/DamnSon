"use client";

import { useEffect } from "react";
import type { MetroVM } from "@/lib/graph/viewModel";
import type { ComposedJourney } from "@/lib/contract/compose";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { canMarkDone } from "@/lib/graph/progress";
import { getStages, currentStage } from "@/lib/graph/stages";
import {
  reduceNavigationKey,
  formatNavigationAnnouncement,
  type NavigationState,
  type AnnouncementParams,
} from "@/lib/graph/navigation";
import { buildStageTrayModel } from "@/lib/graph/stageTray";

function announceNavigation(params: AnnouncementParams) {
  const text = formatNavigationAnnouncement(params);
  if (typeof document !== "undefined") {
    const el = document.getElementById("cw-navigation-live-region");
    if (el) {
      el.textContent = text;
    }
  }
}

export function useSceneKeyboard(metro: MetroVM, journey?: ComposedJourney | null) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore keys while focus is in inputs, textareas, selects, contentEditable, or drawer scrollable areas (§12.1)
      const target = e.target instanceof Element ? e.target : null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          (target as HTMLElement).isContentEditable ||
          target.closest('[data-drawer-scroll="true"]') ||
          target.closest('[data-testid="drawer-content"]'))
      ) {
        return;
      }

      if (metro.stations.length === 0) return;

      const stages = getStages(metro);
      const totalStages = Math.max(1, stages.length);
      const currStageNum = currentStage(metro);

      const { focusStage, setFocusStage, focusedStepId, setFocusedStepId } =
        useViewStore.getState();
      const { activeTaskId, selectedStepId, selectStep, toggleStepDone } =
        useTaskStore.getState();

      // Get stations for the focused stage in tray order (§12.3)
      const stageModel = buildStageTrayModel({
        metro,
        stageNumber: focusStage,
        journey,
      });
      const stageStationIds = stageModel.allOrderedItems.map((i) => i.station.id);

      const navState: NavigationState = {
        totalStages,
        focusStage,
        currentStage: currStageNum,
        focusedStepId,
        selectedStepId,
        stageStationIds,
      };

      const result = reduceNavigationKey(e.key, navState);
      if (result.type === "IGNORED") return;

      e.preventDefault();

      switch (result.type) {
        case "SET_STAGE": {
          setFocusStage(result.stage);
          const nextModel = buildStageTrayModel({
            metro,
            stageNumber: result.stage,
            journey,
          });
          if (result.focusFirstStation && nextModel.allOrderedItems.length > 0) {
            const first = nextModel.allOrderedItems[0]!;
            setFocusedStepId(first.station.id);
            if (selectedStepId) {
              selectStep(first.station.id);
            }
            announceNavigation({
              stageNumber: result.stage,
              totalStages,
              stageName: nextModel.stageName,
              totalStepsInStage: nextModel.totalStations,
              stationNumber: 1,
              stationTitle: first.station.title,
              stationState: first.station.state,
            });
          } else {
            announceNavigation({
              stageNumber: result.stage,
              totalStages,
              stageName: nextModel.stageName,
              totalStepsInStage: nextModel.totalStations,
            });
          }
          break;
        }

        case "FOCUS_STATION": {
          setFocusedStepId(result.stepId);
          if (result.syncDrawer) {
            selectStep(result.stepId);
          }
          const item = stageModel.allOrderedItems.find(
            (i) => i.station.id === result.stepId
          );
          if (item) {
            announceNavigation({
              stageNumber: focusStage,
              totalStages,
              stageName: stageModel.stageName,
              totalStepsInStage: stageModel.totalStations,
              stationNumber: item.indexInStage,
              stationTitle: item.station.title,
              stationState: item.station.state,
            });
          }
          break;
        }

        case "OPEN_DRAWER": {
          selectStep(result.stepId);
          break;
        }

        case "TOGGLE_DONE": {
          if (activeTaskId) {
            const current = metro.stations.find((s) => s.id === result.stepId);
            if (current && canMarkDone(current.kind) && current.state !== "locked") {
              const currentFocus = useViewStore.getState().focusStage;
              toggleStepDone(activeTaskId, result.stepId);
              if (current.state === "available") {
                useViewStore.getState().showUndoToast({
                  taskId: activeTaskId,
                  stepId: result.stepId,
                  title: current.title,
                  previousFocusStage: currentFocus,
                });
              }
            }
          }
          break;
        }

        case "CLOSE_DRAWER": {
          selectStep(null);
          break;
        }

        case "RESET_TO_STAGE_OVERVIEW": {
          setFocusedStepId(null);
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [metro, journey]);
}
