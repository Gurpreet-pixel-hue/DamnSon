"use client";

import React, { useState, useSyncExternalStore, useMemo } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import type { FactKey, FactValue } from "@/lib/contract/facts";
import type { MetroVM } from "@/lib/graph/viewModel";
import { useTaskStore } from "@/lib/store/useTaskStore";

export interface PersonaliseNudgeProps {
  journey?: ComposedJourney;
  metro?: MetroVM | null;
  className?: string;
}

function subscribeStorage(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

export function PersonaliseNudge({
  journey,
  metro,
  className = "",
}: PersonaliseNudgeProps) {
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const factsByTask = useTaskStore((s) => s.factsByTask);
  const setFact = useTaskStore((s) => s.setFact);

  const [dismissedLocally, setDismissedLocally] = useState<Record<string, boolean>>({});

  const isSessionDismissed = useSyncExternalStore(
    subscribeStorage,
    () => {
      if (typeof window === "undefined" || !activeTaskId) return false;
      try {
        return sessionStorage.getItem(`nudge-dismissed-${activeTaskId}`) === "1";
      } catch {
        return false;
      }
    },
    () => false
  );

  const dismissed = Boolean(activeTaskId && (dismissedLocally[activeTaskId] || isSessionDismissed));

  const topQuestion = journey?.questions?.[0];

  const shouldShow = useMemo(() => {
    if (dismissed || !journey || !metro || !topQuestion || !activeTaskId) {
      return false;
    }
    const totalStations = metro.stations.length;
    if (totalStations === 0) return false;

    // At least half the stations are may_apply
    const mayApplyCount = metro.stations.filter(
      (s) => s.applicability === "may_apply"
    ).length;
    if (mayApplyCount < totalStations / 2) {
      return false;
    }

    // Top decisive question is unanswered
    const currentFacts = factsByTask[activeTaskId] ?? {};
    const val = currentFacts[topQuestion.fact];
    const isUnanswered = val === undefined || val === null || val === "";
    return isUnanswered;
  }, [dismissed, journey, metro, topQuestion, activeTaskId, factsByTask]);

  if (!shouldShow || !topQuestion || !activeTaskId) {
    return null;
  }

  const handleSelectOption = (value: FactValue) => {
    setFact(activeTaskId, topQuestion.fact as FactKey, value);
    setDismissedLocally((prev) => ({ ...prev, [activeTaskId]: true }));
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(`nudge-dismissed-${activeTaskId}`, "1");
      } catch {}
    }
  };

  const handleDismiss = () => {
    setDismissedLocally((prev) => ({ ...prev, [activeTaskId]: true }));
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(`nudge-dismissed-${activeTaskId}`, "1");
      } catch {}
    }
  };

  const options =
    topQuestion.options && topQuestion.options.length > 0
      ? topQuestion.options
      : topQuestion.answerType === "boolean"
      ? [
          { value: true, label: "Yes" },
          { value: false, label: "No" },
        ]
      : [];

  return (
    <div
      data-testid="personalise-nudge"
      className={`pointer-events-auto flex items-center flex-wrap gap-2 px-3 py-1.5 rounded-full border border-[var(--cw-border)] bg-[var(--cw-surface)]/95 shadow-md backdrop-blur-xs text-xs text-[var(--cw-text)] select-none ${className}`}
    >
      <span className="font-medium text-[var(--cw-text-muted)]">
        Most steps depend on 1 answer:{" "}
        <strong className="text-[var(--cw-text)] font-semibold">
          {topQuestion.text}
        </strong>
      </span>

      <div className="flex items-center gap-1.5">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => handleSelectOption(opt.value)}
            className="px-2.5 py-0.5 rounded-full border border-[var(--cw-border)] bg-[var(--cw-surface-muted)] hover:bg-[var(--cw-brand)] hover:text-white hover:border-[var(--cw-brand)] transition-colors text-[11px] font-medium cursor-pointer"
          >
            {opt.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-label="Dismiss nudge"
        onClick={handleDismiss}
        className="ml-1 text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] p-0.5 rounded hover:bg-black/5 cursor-pointer leading-none"
      >
        ×
      </button>
    </div>
  );
}
