"use client";

import React, { useEffect, useCallback, useMemo } from "react";
import type { ComposedJourney, ComposedStep } from "@/lib/contract/compose";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { useViewStore } from "@/lib/store/useViewStore";
import { deriveStepStates } from "@/lib/graph/progress";
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
  const showUndoToast = useViewStore((s) => s.showUndoToast);

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
  const actionStep = step && step.kind !== "milestone" ? step : null;

  const completedSet = useMemo(
    () => new Set(activeTaskId ? completedByTask[activeTaskId] ?? [] : []),
    [activeTaskId, completedByTask]
  );
  const stepStates = useMemo(
    () => (journey ? deriveStepStates(journey, completedSet) : new Map<string, string>()),
    [journey, completedSet]
  );
  const currentState = step ? stepStates.get(step.id) ?? "locked" : "locked";
  const isDone = currentState === "done";
  const isLocked = currentState === "locked";
  const isAvailable = currentState === "available";

  const unfinishedPrereqs = useMemo(() => {
    if (!journey || !step || !isLocked) return [];
    const reqEdges = journey.edges.filter((e) => e.to === step.id && e.kind === "requires");
    const stepMap = new Map(journey.steps.map((s) => [s.id, s]));
    return reqEdges
      .map((e) => stepMap.get(e.from))
      .filter((prereq): prereq is ComposedStep => {
        if (!prereq) return false;
        if (prereq.applicability === "may_apply") return false;
        return stepStates.get(prereq.id) !== "done";
      });
  }, [journey, step, isLocked, stepStates]);

  const handleToggleDone = () => {
    if (!activeTaskId || !step) return;
    if (isAvailable) {
      toggleStepDone(activeTaskId, step.id);
      showUndoToast({
        taskId: activeTaskId,
        stepId: step.id,
        title: step.title,
      });
    } else if (isDone) {
      toggleStepDone(activeTaskId, step.id);
    }
  };

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
                  {actionStep ? actionStep.department : "Milestone"}
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
                    : isAvailable
                    ? "bg-[#1F63D6]/10 text-[#1F63D6]"
                    : "bg-[var(--cw-border)]/40 text-[var(--cw-text-muted)]"
                }`}
              >
                {isDone ? "Completed" : isAvailable ? "Available" : "Locked"}
              </span>

              {actionStep && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--cw-border)]/30 text-[var(--cw-text-muted)] capitalize">
                  {actionStep.mode.replace("_", " ")}
                </span>
              )}

              {actionStep && (
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                    actionStep.review.status === "verified"
                      ? "bg-green-500/10 text-green-700 dark:text-green-300"
                      : actionStep.review.status === "flagged"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {actionStep.review.status}
                </span>
              )}
            </div>

            {/* Description */}
            <p className="text-xs text-[var(--cw-text-muted)] leading-relaxed mt-1">
              {(actionStep ? actionStep.description : "") || "Official procedural step required for civic compliance."}
            </p>

            {/* Fee & Timeline breakdown */}
            {actionStep && (
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[var(--cw-border)]/60 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-semibold text-[var(--cw-text-muted)]">
                    Official Fee
                  </span>
                  <span className="font-medium text-[var(--cw-text)]">
                    {actionStep.fee.kind === "free"
                      ? "Free"
                      : actionStep.fee.kind === "fixed"
                      ? formatINR(actionStep.fee.amountINR)
                      : actionStep.fee.kind === "range"
                      ? `${formatINR(actionStep.fee.minINR)}–${formatINR(actionStep.fee.maxINR)}`
                      : "Unconfirmed"}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-semibold text-[var(--cw-text-muted)]">
                    Official SLA
                  </span>
                  <span className="font-medium text-[var(--cw-text)]">
                    {actionStep.timeline.officialSla.kind === "sla"
                      ? `${actionStep.timeline.officialSla.duration.minDays}–${actionStep.timeline.officialSla.duration.maxDays} ${actionStep.timeline.officialSla.duration.dayType} days`
                      : "Standard processing"}
                  </span>
                </div>
              </div>
            )}
            {/* Unfinished Prerequisites Notice (§10.7) */}
            {isLocked && unfinishedPrereqs.length > 0 && (
              <div
                data-testid="drawer-prereqs-notice"
                className="mt-3 p-3 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-background)] text-xs flex flex-col gap-1.5"
              >
                <span className="font-semibold text-[var(--cw-text)] text-[11px]">
                  Finish these first:
                </span>
                <ul className="list-disc list-inside text-[var(--cw-text-muted)] space-y-0.5">
                  {unfinishedPrereqs.map((p) => (
                    <li key={p.id}>{p.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Action button (§10.7) */}
          <div className="pt-4 border-t border-[var(--cw-border)]/60 flex flex-col gap-2">
            {actionStep && activeTaskId && (
              <button
                type="button"
                data-testid="drawer-mark-done-btn"
                disabled={isLocked}
                onClick={handleToggleDone}
                className={`w-full py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-xs ${
                  isLocked
                    ? "bg-[var(--cw-border)]/30 text-[var(--cw-text-muted)] cursor-not-allowed border border-[var(--cw-border)]"
                    : isDone
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
