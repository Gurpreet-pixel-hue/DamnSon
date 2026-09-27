"use client";

import { useEffect } from "react";
import type { MetroVM, StationVM } from "@/lib/graph/viewModel";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { canMarkDone } from "@/lib/graph/progress";

export function useSceneKeyboard(metro: MetroVM) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore keystrokes when typing into input fields
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (metro.stations.length === 0) return;

      const { focusedStepId, setFocusedStepId } = useViewStore.getState();
      const { activeTaskId, selectStep, toggleStepDone } =
        useTaskStore.getState();

      const currentStation = focusedStepId
        ? metro.stations.find((s) => s.id === focusedStepId)
        : null;

      // Group stations by layer
      const layerMap = new Map<number, StationVM[]>();
      for (const s of metro.stations) {
        if (!layerMap.has(s.layer)) {
          layerMap.set(s.layer, []);
        }
        layerMap.get(s.layer)!.push(s);
      }
      for (const list of layerMap.values()) {
        list.sort((a, b) => a.lane - b.lane);
      }
      const sortedLayers = Array.from(layerMap.keys()).sort((a, b) => a - b);

      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!currentStation) {
          const firstLayer = sortedLayers[0];
          const first =
            firstLayer !== undefined ? layerMap.get(firstLayer)?.[0] : null;
          if (first) setFocusedStepId(first.id);
        } else {
          const currentLayerIdx = sortedLayers.indexOf(currentStation.layer);
          const nextLayer = sortedLayers[currentLayerIdx + 1];
          if (nextLayer !== undefined) {
            const nextList = layerMap.get(nextLayer);
            if (nextList && nextList.length > 0) {
              let closest = nextList[0]!;
              let minDiff = Math.abs(closest.lane - currentStation.lane);
              for (const candidate of nextList) {
                const diff = Math.abs(candidate.lane - currentStation.lane);
                if (diff < minDiff) {
                  minDiff = diff;
                  closest = candidate;
                }
              }
              setFocusedStepId(closest.id);
            }
          }
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (currentStation) {
          const currentLayerIdx = sortedLayers.indexOf(currentStation.layer);
          const prevLayer = sortedLayers[currentLayerIdx - 1];
          if (prevLayer !== undefined) {
            const prevList = layerMap.get(prevLayer);
            if (prevList && prevList.length > 0) {
              let closest = prevList[0]!;
              let minDiff = Math.abs(closest.lane - currentStation.lane);
              for (const candidate of prevList) {
                const diff = Math.abs(candidate.lane - currentStation.lane);
                if (diff < minDiff) {
                  minDiff = diff;
                  closest = candidate;
                }
              }
              setFocusedStepId(closest.id);
            }
          }
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!currentStation) {
          const firstLayer = sortedLayers[0];
          const first =
            firstLayer !== undefined ? layerMap.get(firstLayer)?.[0] : null;
          if (first) setFocusedStepId(first.id);
        } else {
          const layerList = layerMap.get(currentStation.layer) ?? [];
          const idx = layerList.findIndex((s) => s.id === currentStation.id);
          if (idx !== -1) {
            const nextIdx =
              e.key === "ArrowDown"
                ? Math.min(idx + 1, layerList.length - 1)
                : Math.max(idx - 1, 0);
            const targetStation = layerList[nextIdx];
            if (targetStation) setFocusedStepId(targetStation.id);
          }
        }
      } else if (e.key === "Enter") {
        if (focusedStepId) {
          e.preventDefault();
          selectStep(focusedStepId);
        }
      } else if (e.key === " " || e.code === "Space") {
        if (focusedStepId && activeTaskId) {
          const current = metro.stations.find((s) => s.id === focusedStepId);
          if (current && canMarkDone(current.kind) && current.state !== "locked") {
            e.preventDefault();
            toggleStepDone(activeTaskId, focusedStepId);
            if (current.state === "available") {
              useViewStore.getState().showUndoToast({
                taskId: activeTaskId,
                stepId: focusedStepId,
                title: current.title,
              });
            }
          }
        }
      } else if (e.key === "Escape") {
        const { selectedStepId, selectStep } = useTaskStore.getState();
        if (selectedStepId) {
          e.preventDefault();
          selectStep(null);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [metro]);
}
