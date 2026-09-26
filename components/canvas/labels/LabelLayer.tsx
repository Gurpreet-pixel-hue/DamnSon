"use client";

import { useMemo } from "react";
import type { MetroVM } from "@/lib/graph/viewModel";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { selectLabels, MAX_LABEL_SLOTS } from "./selectLabels";
import { Badge } from "@/components/ui/badge";

export interface LabelLayerProps {
  metro: MetroVM;
  slotsRef: React.RefObject<(HTMLButtonElement | null)[]>;
}

const SLOTS = Array.from({ length: MAX_LABEL_SLOTS }, (_, i) => i);

export function LabelLayer({ metro, slotsRef }: LabelLayerProps) {
  const hoveredStepId = useViewStore((s) => s.hoveredStepId);
  const focusedStepId = useViewStore((s) => s.focusedStepId);
  const setHoveredStepId = useViewStore((s) => s.setHoveredStepId);
  const setFocusedStepId = useViewStore((s) => s.setFocusedStepId);

  const activeStations = useMemo(
    () => selectLabels(metro, hoveredStepId, focusedStepId),
    [metro, hoveredStepId, focusedStepId]
  );

  return (
    <div
      data-testid="label-layer"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {SLOTS.map((idx) => {
        const station = activeStations[idx];
        if (!station) {
          return (
            <button
              key={`label-slot-${idx}`}
              ref={(el) => {
                if (slotsRef.current) slotsRef.current[idx] = el;
              }}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              style={{ visibility: "hidden" }}
              className="pointer-events-none absolute left-0 top-0"
            />
          );
        }

        const isHovered = station.id === hoveredStepId;
        const isFocused = station.id === focusedStepId;

        let stateColor = "text-zinc-400 border-zinc-700 bg-zinc-800/60";
        let stateLabel: string = station.state;
        if (station.applicability === "may_apply") {
          stateColor = "text-amber-400 border-amber-500/40 bg-amber-950/40";
          stateLabel = "may apply";
        } else if (station.state === "available") {
          stateColor = "text-cyan-400 border-cyan-500/40 bg-cyan-950/40";
        } else if (station.state === "done") {
          stateColor = "text-emerald-400 border-emerald-500/40 bg-emerald-950/40";
        }

        return (
          <button
            key={`label-slot-${idx}`}
            ref={(el) => {
              if (slotsRef.current) slotsRef.current[idx] = el;
            }}
            type="button"
            aria-label={`${station.title}, ${stateLabel}`}
            onClick={() => {
              useTaskStore.getState().selectStep(station.id);
              setFocusedStepId(station.id);
            }}
            onMouseEnter={() => setHoveredStepId(station.id)}
            onMouseLeave={() => setHoveredStepId(null)}
            onFocus={() => setFocusedStepId(station.id)}
            onBlur={() => {
              if (useViewStore.getState().focusedStepId === station.id) {
                setFocusedStepId(null);
              }
            }}
            style={{
              visibility: "hidden", // LabelProjector will toggle visibility and transform
              willChange: "transform",
            }}
            className={`pointer-events-auto absolute left-0 top-0 flex flex-col items-center gap-1 rounded-lg border bg-zinc-950/90 p-2 shadow-2xl backdrop-blur-md transition-shadow cursor-pointer select-none ${
              isFocused
                ? "border-cyan-400 ring-2 ring-cyan-400/30 scale-105 z-20"
                : isHovered
                ? "border-white/30 scale-100 z-10"
                : "border-white/10 opacity-90 scale-95 z-0"
            }`}
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-xs font-semibold text-zinc-100">
                {station.title}
              </span>
              {station.badge && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  {station.badge}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-0.2 text-[10px] font-medium capitalize ${stateColor}`}
              >
                {stateLabel}
              </span>
              {station.officeType && (
                <span className="text-[10px] text-zinc-400">
                  {station.officeType.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
