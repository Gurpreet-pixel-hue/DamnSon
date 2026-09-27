"use client";

import React from "react";
import type { ShareState } from "@/lib/graph/shareState";

export interface ConflictBannerProps {
  sharedState: ShareState;
  onApply: () => void;
  onKeepMine: () => void;
  className?: string;
}

export function ConflictBanner({
  sharedState,
  onApply,
  onKeepMine,
  className = "",
}: ConflictBannerProps) {
  const completedCount = sharedState.completed.length;
  const factsCount = Object.keys(sharedState.facts).length;

  return (
    <div
      role="alert"
      data-testid="conflict-banner"
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-950 dark:text-blue-200 text-xs shadow-sm ${className}`}
    >
      <div className="flex items-start sm:items-center gap-2.5">
        <svg
          className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 sm:mt-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <span className="font-semibold uppercase tracking-wider text-[10px] text-blue-700 dark:text-blue-300">
            Shared Progress
          </span>
          <span className="text-[var(--cw-text)] leading-tight">
            This shared link includes {completedCount} completed {completedCount === 1 ? "step" : "steps"} and {factsCount} answered {factsCount === 1 ? "question" : "questions"} that differ from your saved progress.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        <button
          type="button"
          data-testid="conflict-apply-btn"
          onClick={onApply}
          className="px-3 py-1.5 rounded-lg bg-[var(--cw-brand)] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          Apply shared link
        </button>
        <button
          type="button"
          data-testid="conflict-keep-btn"
          onClick={onKeepMine}
          className="px-3 py-1.5 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] text-xs font-medium hover:bg-[var(--cw-border)]/20 transition-colors"
        >
          Keep mine
        </button>
      </div>
    </div>
  );
}
