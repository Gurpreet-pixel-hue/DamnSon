"use client";

import React, { useMemo, useRef, useEffect } from "react";
import type { MetroVM } from "@/lib/graph/viewModel";
import { getStages, currentStage, type Stage } from "@/lib/graph/stages";
import { useViewStore } from "@/lib/store/useViewStore";

export interface StageBarProps {
  metro: MetroVM | null;
  className?: string;
}

/**
 * Returns formatted pill label for a stage (§12.2).
 * e.g. "1 Start here", "2 Then", "4 In parallel · 15".
 */
export function getStagePillLabel(stage: Stage): string {
  const count = stage.stations.length;
  if (stage.layer === 0) {
    return `${stage.number} Start here`;
  }
  if (count > 1) {
    return `${stage.number} In parallel · ${count}`;
  }
  return `${stage.number} Then`;
}

/**
 * Determines whether a stage pill should collapse to a number (§12.2).
 * When totalStages > 7, pills outside [focusStage - 2, focusStage + 2] collapse.
 */
export function isPillCollapsed(
  stageNumber: number,
  focusStage: number,
  totalStages: number
): boolean {
  if (totalStages <= 7) return false;
  return Math.abs(stageNumber - focusStage) > 2;
}

export function StageBar({ metro, className = "" }: StageBarProps) {
  const focusStage = useViewStore((s) => s.focusStage);
  const setFocusStage = useViewStore((s) => s.setFocusStage);

  const stages = useMemo(() => (metro ? getStages(metro) : []), [metro]);
  const activeCurrentStage = useMemo(
    () => (metro ? currentStage(metro) : 1),
    [metro]
  );

  const totalStages = Math.max(1, stages.length);
  const canGoPrev = focusStage > 1;
  const canGoNext = focusStage < totalStages;

  const barRef = useRef<HTMLDivElement>(null);
  const focusedPillRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll focused pill into view inside the bar
  useEffect(() => {
    if (focusedPillRef.current && barRef.current) {
      focusedPillRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [focusStage]);

  if (!metro || stages.length === 0) return null;

  return (
    <div
      data-testid="stage-bar"
      className={`pointer-events-auto flex items-center gap-2 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)]/95 px-3 py-1.5 shadow-md backdrop-blur-md select-none max-w-[85vw] ${className}`}
    >
      {/* Back to current step (if browsing away) */}
      {focusStage !== activeCurrentStage && (
        <button
          type="button"
          data-testid="stepper-back-to-current"
          onClick={() => setFocusStage(activeCurrentStage)}
          className="shrink-0 rounded-full bg-[var(--cw-brand)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--cw-brand)] hover:bg-[var(--cw-brand)]/20 transition-colors cursor-pointer"
        >
          Back to current step
        </button>
      )}

      {/* Prev button */}
      <button
        type="button"
        data-testid="stepper-prev-btn"
        disabled={!canGoPrev}
        onClick={() => setFocusStage(focusStage - 1)}
        aria-label="Previous stage"
        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-base font-bold text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] hover:bg-[var(--cw-border)]/40 disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
      >
        ‹
      </button>

      {/* Horizontally scrollable pills row */}
      <div
        ref={barRef}
        data-testid="stage-bar-pills"
        className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar scroll-smooth"
      >
        {stages.map((stage) => {
          const isFocused = stage.number === focusStage;
          const isCurrent = stage.number === activeCurrentStage;
          const isDone = stage.isDone;
          const isCollapsed = isPillCollapsed(stage.number, focusStage, totalStages);
          const fullLabel = getStagePillLabel(stage);

          // Pill styles according to §12.2:
          // done: green with check
          // current: blue ring
          // focused: accent fill
          // future: outline
          let styleClasses = "border-[var(--cw-border)] bg-[var(--cw-background)] text-[var(--cw-text-muted)] hover:border-[var(--cw-text-muted)]";
          if (isFocused) {
            styleClasses = "border-[var(--cw-brand)] bg-[var(--cw-brand)] text-white font-semibold shadow-xs";
          } else if (isDone) {
            styleClasses = "border-[#1E7F3B] bg-[#1E7F3B]/10 text-[#1E7F3B] font-medium";
          }

          if (isCurrent && !isFocused) {
            styleClasses += " ring-2 ring-[var(--cw-brand)] ring-offset-1";
          }

          return (
            <button
              key={`pill-${stage.number}`}
              ref={isFocused ? focusedPillRef : null}
              type="button"
              data-testid={`stage-pill-${stage.number}`}
              onClick={() => setFocusStage(stage.number)}
              title={fullLabel}
              aria-label={`Go to stage ${stage.number}: ${stage.name}`}
              className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs whitespace-nowrap transition-all cursor-pointer ${
                isCollapsed ? "min-w-[28px] justify-center px-2" : ""
              } ${styleClasses}`}
            >
              {isDone && (
                <svg
                  className="h-3 w-3 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              <span>{isCollapsed ? stage.number : fullLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Next button */}
      <button
        type="button"
        data-testid="stepper-next-btn"
        disabled={!canGoNext}
        onClick={() => setFocusStage(focusStage + 1)}
        aria-label="Next stage"
        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-base font-bold text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] hover:bg-[var(--cw-border)]/40 disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
      >
        ›
      </button>
    </div>
  );
}

// Re-export alias for backward compatibility with StageStepper
export { StageBar as StageStepper };
