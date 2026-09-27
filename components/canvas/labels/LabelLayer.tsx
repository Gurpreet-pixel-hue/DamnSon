"use client";

import { useMemo, useState, useEffect } from "react";
import type { MetroVM, StationVM } from "@/lib/graph/viewModel";
import { useViewStore, requestHover } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";

export interface LabelLayerProps {
  metro: MetroVM;
  cardSlotsRef: React.RefObject<Map<string, HTMLDivElement>>;
  tetherRefs: React.RefObject<Map<string, SVGSVGElement>>;
  tooltipRef?: React.RefObject<HTMLDivElement | null>;
}

function formatMode(mode: string | null): string {
  if (!mode) return "";
  if (mode === "online") return "Online · from home";
  if (mode === "in_person") return "In person · visit the office";
  if (mode === "hybrid") return "Online + office visit";
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
  cardSlotsRef,
  tetherRefs,
  tooltipRef,
}: LabelLayerProps) {
  const focusStage = useViewStore((s) => s.focusStage);
  const wholeRouteView = useViewStore((s) => s.wholeRouteView);
  const hoveredStepId = useViewStore((s) => s.hoveredStepId);
  const focusedStepId = useViewStore((s) => s.focusedStepId);
  const selectedStepId = useTaskStore((s) => s.selectedStepId);
  const setFocusedStepId = useViewStore((s) => s.setFocusedStepId);

  // Staging fade transitions on focusStage change (§11.4: fade out 120ms, fade in 180ms)
  const [displayedStage, setDisplayedStage] = useState(focusStage);
  const [stageOpacity, setStageOpacity] = useState(1);

  useEffect(() => {
    if (displayedStage !== focusStage) {
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        const t = setTimeout(() => {
          setDisplayedStage(focusStage);
          setStageOpacity(1);
        }, 0);
        return () => clearTimeout(t);
      }
      const tFade = setTimeout(() => {
        setStageOpacity(0);
      }, 0);
      const timer = setTimeout(() => {
        setDisplayedStage(focusStage);
        setStageOpacity(1);
      }, 120);
      return () => {
        clearTimeout(tFade);
        clearTimeout(timer);
      };
    }
  }, [focusStage, displayedStage]);

  // Stations belonging to the currently displayed stage
  const stageStations = useMemo(() => {
    return metro.stations.filter((s) => s.layer === displayedStage - 1);
  }, [metro.stations, displayedStage]);

  const isCompact = stageStations.length > 4;

  // If > 8 stations, cards only for available ones (§11.2)
  const visibleStations = useMemo(() => {
    if (stageStations.length > 8) {
      return stageStations.filter((s) => s.state === "available");
    }
    return stageStations;
  }, [stageStations]);

  const hoveredStation = useMemo(() => {
    if (!hoveredStepId) return null;
    return metro.stations.find((s) => s.id === hoveredStepId) ?? null;
  }, [metro.stations, hoveredStepId]);

  return (
    <div
      data-testid="label-layer"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* 1. Stage Station Cards: only for focused stage, hidden in wholeRouteView (§11.2, §11.3) */}
      {!wholeRouteView &&
        visibleStations.map((station) => {
          let stateLabel: string = station.state;
          if (station.applicability === "may_apply") {
            stateLabel = "may apply";
          }

          const isHovered = station.id === hoveredStepId;
          const isFocused =
            station.id === focusedStepId || station.id === selectedStepId;
          const isExpanded = isHovered || isFocused;
          const isDone = station.state === "done";

          return (
            <div
              key={station.id}
              ref={(el) => {
                if (el) {
                  cardSlotsRef.current.set(station.id, el);
                } else {
                  cardSlotsRef.current.delete(station.id);
                }
              }}
              data-station-id={station.id}
              style={{
                visibility: "hidden", // LabelProjector sets transform and visibility
                opacity: stageOpacity,
                transition: "opacity 180ms ease-out", // NO transform transition (§11.4)
                willChange: "transform, opacity",
              }}
              className={`pointer-events-auto absolute left-0 top-0 ${
                isCompact ? "w-[200px] h-[46px]" : "w-[220px] h-[52px]"
              }`}
            >
              <button
                type="button"
                data-mode={isCompact ? "compact" : "full"}
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
                className={`group flex items-center gap-2 rounded-[10px] border shadow-[0_2px_8px_rgba(0,0,0,0.08)] cursor-pointer select-none text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none box-border ${
                  isCompact
                    ? "w-[200px] h-[46px] py-1.5 px-2.5"
                    : "w-[220px] h-[52px] px-2.5 py-1.5"
                } ${
                  isDone
                    ? "bg-[#F4F9F5] border-[#C2E0C9] text-[#1E7F3B]"
                    : "bg-white border-[#E6DDC8] text-[#1F242E]"
                } ${
                  isExpanded
                    ? "border-[#8A4A0A] ring-2 ring-[#8A4A0A]/30 shadow-lg z-30"
                    : "hover:border-[#8A4A0A]/70 hover:shadow-md z-10"
                }`}
              >
                {renderStateIcon(station)}
                <div className="flex flex-col min-w-0 pr-1 overflow-hidden">
                  <span
                    className={`font-semibold leading-snug text-[#1F242E] ${
                      isCompact
                        ? "text-[12px] line-clamp-2 break-words"
                        : "text-[13px] line-clamp-2 break-words"
                    }`}
                  >
                    {station.title}
                  </span>
                  {!isCompact && (
                    <span className="text-[11px] text-[#697586] leading-tight truncate mt-0.5">
                      {formatMode(station.mode)}
                    </span>
                  )}
                </div>
              </button>

              {/* Dynamic SVG tether line connecting card edge back to station building top (§11.4) */}
              <svg
                ref={(el) => {
                  if (el) {
                    tetherRefs.current.set(station.id, el);
                  } else {
                    tetherRefs.current.delete(station.id);
                  }
                }}
                className="pointer-events-none absolute left-1/2 top-1/2 w-0 h-0 overflow-visible -z-10"
                aria-hidden="true"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="0"
                  stroke="#9A8E78"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          );
        })}

      {/* 2. Hover Tooltip in place ("title · Stage n", §11.2 & §11.4) */}
      <div
        ref={tooltipRef}
        data-testid="station-hover-tooltip"
        style={{
          visibility: "hidden",
          willChange: "transform",
        }}
        className="pointer-events-none absolute left-0 top-0 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border border-[#8A4A0A]/40 bg-[#FAF8F5] text-[#1F242E] shadow-md text-[12px] font-medium whitespace-nowrap"
      >
        {hoveredStation && (
          <span>
            {hoveredStation.title} · Stage {hoveredStation.layer + 1}
          </span>
        )}
      </div>
    </div>
  );
}
