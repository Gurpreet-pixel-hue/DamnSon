"use client";

import React, { useMemo } from "react";
import type { MetroVM } from "@/lib/graph/viewModel";
import { getStages, currentStage } from "@/lib/graph/stages";
import { useViewStore } from "@/lib/store/useViewStore";

export interface StageStepperProps {
  metro: MetroVM | null;
  className?: string;
}

export function StageStepper({ metro, className = "" }: StageStepperProps) {
  const focusStage = useViewStore((s) => s.focusStage);
  const setFocusStage = useViewStore((s) => s.setFocusStage);

  const stages = useMemo(() => (metro ? getStages(metro) : []), [metro]);
  const activeCurrentStage = useMemo(
    () => (metro ? currentStage(metro) : 1),
    [metro]
  );

  const totalStages = Math.max(1, stages.length);
  const currentStageInfo = stages[focusStage - 1];
  const stageName = currentStageInfo ? currentStageInfo.name : "Start here";

  const canGoPrev = focusStage > 1;
  const canGoNext = focusStage < totalStages;

  const handlePrev = () => {
    if (canGoPrev) setFocusStage(focusStage - 1);
  };

  const handleNext = () => {
    if (canGoNext) setFocusStage(focusStage + 1);
  };

  if (!metro || stages.length === 0) return null;

  return (
    <div
      data-testid="stage-stepper"
      className={`pointer-events-auto flex flex-col items-center gap-1.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)]/95 px-4 py-2 text-xs shadow-md backdrop-blur-md select-none ${className}`}
    >
      {/* Top row: Back to current (if browsing away) + ‹ Stage N of M · Name › */}
      <div className="flex items-center gap-2">
        {focusStage !== activeCurrentStage && (
          <button
            type="button"
            data-testid="stepper-back-to-current"
            onClick={() => setFocusStage(activeCurrentStage)}
            className="mr-1 rounded-md bg-[var(--cw-brand)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--cw-brand)] hover:bg-[var(--cw-brand)]/20 transition-colors"
          >
            Back to current step
          </button>
        )}

        <button
          type="button"
          data-testid="stepper-prev-btn"
          disabled={!canGoPrev}
          onClick={handlePrev}
          aria-label="Previous stage"
          className="flex h-5 w-5 items-center justify-center rounded text-sm font-bold text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] hover:bg-[var(--cw-border)]/40 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          ‹
        </button>

        <span
          data-testid="stepper-label"
          className="font-semibold text-[var(--cw-text)] tracking-tight px-1"
        >
          Stage {focusStage} of {totalStages} · {stageName}
        </span>

        <button
          type="button"
          data-testid="stepper-next-btn"
          disabled={!canGoNext}
          onClick={handleNext}
          aria-label="Next stage"
          className="flex h-5 w-5 items-center justify-center rounded text-sm font-bold text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] hover:bg-[var(--cw-border)]/40 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          ›
        </button>
      </div>

      {/* Bottom row: one dot per stage */}
      <div className="flex items-center gap-1.5 pt-0.5">
        {stages.map((stage) => {
          const isFocused = stage.number === focusStage;
          const isDone = stage.isDone;

          return (
            <button
              key={`dot-${stage.number}`}
              type="button"
              data-testid={`stepper-dot-${stage.number}`}
              onClick={() => setFocusStage(stage.number)}
              title={stage.label}
              aria-label={`Go to stage ${stage.number}: ${stage.name}`}
              className={`flex items-center justify-center transition-all ${
                isDone
                  ? "h-3.5 w-3.5 rounded-full bg-[#1E7F3B] text-white shadow-xs"
                  : isFocused
                  ? "h-3 w-3 rounded-full bg-[var(--cw-brand)] ring-2 ring-[var(--cw-brand)]/30"
                  : "h-2.5 w-2.5 rounded-full border border-[var(--cw-border)] bg-[var(--cw-background)] hover:border-[var(--cw-text-muted)]"
              }`}
            >
              {isDone && (
                <svg
                  className="h-2.5 w-2.5"
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
