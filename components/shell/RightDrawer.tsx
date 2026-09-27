"use client";

import React, { useEffect, useCallback } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { formatINR } from "@/lib/graph/summary";

export interface RightDrawerProps {
  journey?: ComposedJourney;
  className?: string;
}

export function RightDrawer({ journey, className = "" }: RightDrawerProps) {
  const selectedStepId = useTaskStore((s) => s.selectedStepId);
  const selectStep = useTaskStore((s) => s.selectStep);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const toggleStepDone = useTaskStore((s) => s.toggleStepDone);
  const completedByTask = useTaskStore((s) => s.completedByTask);

  const isOpen = Boolean(selectedStepId);

  const handleClose = useCallback(() => {
    selectStep(null);
  }, [selectStep]);

  // Escape key closes drawer (P11 & P12)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  const step = journey?.steps.find((s) => s.id === selectedStepId);
  const isDone = activeTaskId && selectedStepId
    ? (completedByTask[activeTaskId] ?? []).includes(selectedStepId)
    : false;

  return (
    <aside
      data-testid="right-drawer"
      data-state={isOpen ? "open" : "closed"}
      aria-label="Step details inspector"
      className={`relative shrink-0 overflow-hidden rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] shadow-xs transition-[width,transform] duration-240 ease-out motion-reduce:transition-none flex flex-col ${
        isOpen
          ? "w-[380px] opacity-100 pointer-events-auto"
          : "w-0 border-transparent opacity-0 pointer-events-none p-0"
      } ${className}`}
    >
      {isOpen && step && (
        <div className="w-[380px] h-full flex flex-col justify-between p-5 overflow-y-auto">
          {/* Header */}
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--cw-border)]/60">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--cw-text-muted)]">
                  {step.kind === "milestone" ? "Milestone" : (step as any).department ?? "Action Step"}
                </span>
                <h2 className="text-base font-bold text-[var(--cw-text)] tracking-tight leading-snug">
                  {step.title}
                </h2>
              </div>
              <button
                type="button"
                data-testid="drawer-close-button"
                onClick={handleClose}
                className="p-1 rounded-lg text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] hover:bg-[var(--cw-border)]/20 transition-colors shrink-0"
                aria-label="Close drawer"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                  isDone
                    ? "bg-[#1E7F3B]/10 text-[#1E7F3B]"
                    : "bg-[var(--cw-border)]/40 text-[var(--cw-text)]"
                }`}
              >
                {isDone ? "Completed" : "Available"}
              </span>

              {step.kind !== "milestone" && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--cw-border)]/30 text-[var(--cw-text-muted)] capitalize">
                  {(step as any).mode?.replace("_", " ")}
                </span>
              )}

              {step.kind !== "milestone" && (step as any).review?.status && (
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                    (step as any).review.status === "verified"
                      ? "bg-green-500/10 text-green-700 dark:text-green-300"
                      : (step as any).review.status === "flagged"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {(step as any).review.status}
                </span>
              )}
            </div>

            {/* Description */}
            <p className="text-xs text-[var(--cw-text-muted)] leading-relaxed mt-1">
              {step.description || "Official procedural step required for civic compliance."}
            </p>

            {/* Fee & Timeline breakdown */}
            {step.kind !== "milestone" && (
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[var(--cw-border)]/60 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-semibold text-[var(--cw-text-muted)]">
                    Official Fee
                  </span>
                  <span className="font-medium text-[var(--cw-text)]">
                    {(step as any).fee?.kind === "free"
                      ? "Free"
                      : (step as any).fee?.kind === "fixed"
                      ? formatINR((step as any).fee.amountINR)
                      : (step as any).fee?.kind === "range"
                      ? `${formatINR((step as any).fee.minINR)}–${formatINR((step as any).fee.maxINR)}`
                      : "Unconfirmed"}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-semibold text-[var(--cw-text-muted)]">
                    Official SLA
                  </span>
                  <span className="font-medium text-[var(--cw-text)]">
                    {(step as any).timeline?.officialSla?.kind === "sla"
                      ? `${(step as any).timeline.officialSla.minDuration}–${(step as any).timeline.officialSla.maxDuration} ${(step as any).timeline.officialSla.unit} days`
                      : "Standard processing"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action button */}
          <div className="pt-4 border-t border-[var(--cw-border)]/60 flex flex-col gap-2">
            {step.kind !== "milestone" && activeTaskId && (
              <button
                type="button"
                data-testid="drawer-mark-done-btn"
                onClick={() => toggleStepDone(activeTaskId, step.id)}
                className={`w-full py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-xs ${
                  isDone
                    ? "bg-[var(--cw-border)]/50 text-[var(--cw-text)] hover:bg-[var(--cw-border)]"
                    : "bg-[var(--cw-brand)] text-white hover:opacity-90"
                }`}
              >
                {isDone ? "Mark as not done" : "Mark as complete"}
              </button>
            )}
            <span className="text-[10px] text-center text-[var(--cw-text-muted)]">
              Full drawer tabs (Overview / Documents / Fees / Source) arrive in FE-4
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
