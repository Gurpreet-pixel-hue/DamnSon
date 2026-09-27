"use client";

import React, { useSyncExternalStore } from "react";
import Link from "next/link";
import { useTaskStore } from "@/lib/store/useTaskStore";
import type { TemplateSummary } from "@/lib/contract/api";

const emptySubscribe = () => () => {};

export interface ContinueCardProps {
  templates: TemplateSummary[];
  className?: string;
}

export function ContinueCard({ templates, className = "" }: ContinueCardProps) {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const completedByTask = useTaskStore((s) => s.completedByTask);
  const factsByTask = useTaskStore((s) => s.factsByTask);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);

  if (!isMounted) return null;

  // Find task with saved progress
  let candidateTaskId: string | null = null;
  if (
    activeTaskId &&
    ((completedByTask[activeTaskId] && completedByTask[activeTaskId]!.length > 0) ||
      (factsByTask[activeTaskId] && Object.keys(factsByTask[activeTaskId]!).length > 0))
  ) {
    candidateTaskId = activeTaskId;
  } else {
    const taskWithCompleted = Object.keys(completedByTask).find(
      (tid) => completedByTask[tid] && completedByTask[tid]!.length > 0
    );
    if (taskWithCompleted) {
      candidateTaskId = taskWithCompleted;
    } else {
      const taskWithFacts = Object.keys(factsByTask).find(
        (tid) => factsByTask[tid] && Object.keys(factsByTask[tid]!).length > 0
      );
      if (taskWithFacts) {
        candidateTaskId = taskWithFacts;
      }
    }
  }

  if (!candidateTaskId) return null;

  const template = templates.find((t) => t.taskId === candidateTaskId);
  if (!template) return null;

  const completedCount = completedByTask[candidateTaskId]?.length ?? 0;
  const totalSteps = template.stepCount;

  return (
    <div
      data-testid="continue-card"
      className={`w-full rounded-2xl border border-[var(--cw-brand)]/40 bg-[var(--cw-surface)] p-4 shadow-sm flex items-center justify-between gap-4 transition-all hover:border-[var(--cw-brand)] ${className}`}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--cw-brand)]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--cw-brand)]">
            Resume in progress
          </span>
        </div>
        <p className="text-sm font-semibold text-[var(--cw-text)] truncate">
          Continue: {template.title} &middot; {completedCount} of {totalSteps} done
        </p>
      </div>

      <Link
        href={`/journey/${candidateTaskId}`}
        className="shrink-0 px-4 py-2 rounded-xl bg-[var(--cw-brand)] text-white text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 shadow-xs"
      >
        <span>Open</span>
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </div>
  );
}
