"use client";

import { useMemo, useLayoutEffect } from "react";
import type { MetroVM, StationVM } from "@/lib/graph/viewModel";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { selectLabels, MAX_LABEL_SLOTS } from "./selectLabels";

export interface LabelLayerProps {
  metro: MetroVM;
  slotsRef: React.RefObject<(HTMLButtonElement | null)[]>;
  pinSlotsRef?: React.RefObject<(HTMLButtonElement | null)[]>;
  selectionRef?: React.RefObject<StationVM[]>;
}

const SLOTS = Array.from({ length: MAX_LABEL_SLOTS }, (_, i) => i);

function formatMode(mode: string | null): string {
  if (!mode) return "";
  if (mode === "in_person") return "In person";
  if (mode === "online") return "Online";
  return mode.replace(/_/g, " ");
}

function renderStateIcon(station: StationVM) {
  if (station.kind === "milestone") {
    return (
      <div
        className="w-7 h-7 rounded-full bg-[#FAF5EB] border-2 border-[#8A4A0A] text-[#8A4A0A] flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      </div>
    );
  }

  if (station.applicability === "may_apply") {
    return (
      <div
        className="w-7 h-7 rounded-full bg-[#FEF6EE] border border-dashed border-[#B45309] text-[#B45309] flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01"
          />
        </svg>
      </div>
    );
  }

  if (station.state === "done") {
    return (
      <div
        className="w-7 h-7 rounded-full bg-[#EAF5EC] border border-[#C2E0C9] text-[#1E7F3B] flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>
    );
  }

  if (station.state === "available") {
    return (
      <div
        className="w-7 h-7 rounded-full bg-[#EBF2FC] border border-[#BCD4F7] text-[#1F63D6] flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 21h16.5M4.5 3h15M6 3v18m12-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6h1.5m-1.5 3h1.5m-1.5 3h1.5M9 21v-3.75a1.5 1.5 0 011.5-1.5h3a1.5 1.5 0 011.5 1.5V21"
          />
        </svg>
      </div>
    );
  }

  // Locked default
  return (
    <div
      className="w-7 h-7 rounded-full bg-[#F0EDE6] border border-[#D9D3C7] text-[#8A94A0] flex items-center justify-center shrink-0"
      aria-hidden="true"
    >
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
        />
      </svg>
    </div>
  );
}

export function LabelLayer({
  metro,
  slotsRef,
  pinSlotsRef,
  selectionRef,
}: LabelLayerProps) {
  const hoveredStepId = useViewStore((s) => s.hoveredStepId);
  const focusedStepId = useViewStore((s) => s.focusedStepId);
  const selectedStepId = useTaskStore((s) => s.selectedStepId);
  const setHoveredStepId = useViewStore((s) => s.setHoveredStepId);
  const setFocusedStepId = useViewStore((s) => s.setFocusedStepId);

  const activeStations = useMemo(
    () => selectLabels(metro, hoveredStepId, focusedStepId, selectedStepId),
    [metro, hoveredStepId, focusedStepId, selectedStepId]
  );

  useLayoutEffect(() => {
    if (selectionRef) {
      selectionRef.current = activeStations;
    }
  }, [activeStations, selectionRef]);

  return (
    <div
      data-testid="label-layer"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* 1. Pins layer: a pin for every station (F3: 28 px icon circle on 24 px stem, never culled) */}
      {metro.stations.slice(0, MAX_LABEL_SLOTS).map((station, idx) => {
        let stateLabel: string = station.state;
        if (station.applicability === "may_apply") {
          stateLabel = "may apply";
        }

        const isHovered = station.id === hoveredStepId;
        const isFocused = station.id === focusedStepId || station.id === selectedStepId;

        return (
          <button
            key={`pin-slot-${station.id}`}
            ref={(el) => {
              if (pinSlotsRef?.current) pinSlotsRef.current[idx] = el;
            }}
            type="button"
            aria-label={`${station.title}, ${stateLabel} pin`}
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
              visibility: "hidden", // LabelProjector sets visibility and transform
              willChange: "transform",
            }}
            className={`pointer-events-auto absolute left-0 top-0 flex flex-col items-center cursor-pointer select-none focus-visible:outline-none transition-transform ${
              isFocused
                ? "scale-110 z-30"
                : isHovered
                ? "scale-105 z-25"
                : "z-15"
            }`}
          >
            {/* 28 px state-coloured icon circle */}
            {renderStateIcon(station)}
            {/* 24 px stem */}
            <div className="w-[1.5px] h-[24px] bg-[#9A8E78] shadow-sm" aria-hidden="true" />
            {/* anchor base dot */}
            <div className="w-1.5 h-1.5 rounded-full bg-[#7D725C] -mt-0.5" aria-hidden="true" />
          </button>
        );
      })}

      {/* 2. Cards layer: up to 25 cards with priority collision culling */}
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
        const isFocused = station.id === focusedStepId || station.id === selectedStepId;

        let stateLabel: string = station.state;
        if (station.applicability === "may_apply") {
          stateLabel = "may apply";
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
              visibility: "hidden", // LabelProjector toggles visibility and transform
              willChange: "transform",
            }}
            className={`pointer-events-auto absolute left-0 top-0 flex items-center gap-2.5 px-3 py-2 rounded-[10px] border bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all cursor-pointer select-none text-left max-w-[260px] focus-visible:outline-none ${
              isFocused
                ? "border-[#8A4A0A] ring-2 ring-[#8A4A0A]/30 z-30 scale-105"
                : isHovered
                ? "border-[#8A4A0A]/50 z-20 scale-[1.02]"
                : "border-[#E6DDC8] z-10"
            }`}
          >
            {renderStateIcon(station)}
            <div className="flex flex-col min-w-0 pr-1">
              <span className="text-[13px] font-semibold text-[#1F242E] leading-tight line-clamp-2 break-words">
                {station.title}
              </span>
              <span className="text-[11px] text-[#697586] leading-tight truncate">
                {formatMode(station.mode)}
              </span>
            </div>
            {/* 1 px tether line to building top */}
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 w-[1px] h-3 bg-[#B0A48E] pointer-events-none"
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
