"use client";

import { useMemo, useLayoutEffect } from "react";
import type { MetroVM, StationVM } from "@/lib/graph/viewModel";
import { useViewStore, requestHover } from "@/lib/store/useViewStore";
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
  const setFocusedStepId = useViewStore((s) => s.setFocusedStepId);

  // §10.6: Placement depends only on metro, layout, and state.
  // hoveredStepId and focusedStepId are removed from its inputs, so hover never moves other labels.
  const activeStations = useMemo(
    () => selectLabels(metro, selectedStepId),
    [metro, selectedStepId]
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
            onMouseEnter={() => requestHover(station.id)}
            onMouseLeave={() => requestHover(null)}
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
                ? "scale-110 z-50"
                : isHovered
                ? "scale-105 z-50"
                : "z-5"
            }`}
          >
            {/* Expanded tooltip on hover for pin (§10.6: expands in place, no re-layout) */}
            {isHovered && (
              <div
                className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] border border-[#8A4A0A]/50 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.12)] z-50 whitespace-nowrap"
                style={{ minWidth: "150px" }}
              >
                {renderStateIcon(station)}
                <div className="flex flex-col min-w-0 pr-1 text-left">
                  <span className="text-[13px] font-semibold text-[#1F242E] leading-tight line-clamp-1">
                    {station.title}
                  </span>
                  <span className="text-[11px] text-[#697586] leading-tight">
                    {formatMode(station.mode)}
                  </span>
                </div>
              </div>
            )}
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
        const isExpanded = isHovered || isFocused;

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
            data-mode="full"
            title={station.title}
            aria-label={`${station.title}, ${stateLabel}`}
            onClick={() => {
              useTaskStore.getState().selectStep(station.id);
              setFocusedStepId(station.id);
            }}
            onMouseEnter={() => requestHover(station.id)}
            onMouseLeave={() => requestHover(null)}
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
            className={`group pointer-events-auto absolute left-0 top-0 flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] border bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all cursor-pointer select-none text-left max-w-[260px] data-[mode=compact]:max-w-[180px] data-[mode=compact]:py-1 data-[mode=compact]:px-2 focus-visible:outline-none ${
              isExpanded
                ? "border-[#8A4A0A] ring-2 ring-[#8A4A0A]/30 z-50 scale-105 shadow-xl !max-w-[260px]"
                : "border-[#E6DDC8] z-20"
            }`}
          >
            {renderStateIcon(station)}
            <div className="flex flex-col min-w-0 pr-1">
              <span className="text-[13px] font-semibold text-[#1F242E] leading-tight line-clamp-2 break-words group-data-[mode=compact]:line-clamp-1 group-data-[mode=compact]:truncate group-data-[mode=compact]:max-w-[120px]">
                {station.title}
              </span>
              <span className="text-[11px] text-[#697586] leading-tight truncate group-data-[mode=compact]:hidden">
                {formatMode(station.mode)}
              </span>
            </div>
            {/* Dynamic leader line connecting card edge back to station anchor (H2 & H3) */}
            <svg
              className="pointer-events-none absolute left-1/2 top-1/2 overflow-visible -z-10"
              aria-hidden="true"
            >
              <line
                x1="0"
                y1="22"
                x2="0"
                y2="64"
                stroke="#B0A48E"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
