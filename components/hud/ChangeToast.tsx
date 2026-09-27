"use client";

import React, { useEffect } from "react";
import { formatDiff, type JourneyDiff } from "@/lib/graph/journeyDiff";

export interface ChangeToastProps {
  change: JourneyDiff | null;
  /** Bumps on every fact change so the same diff twice still re-shows. */
  version: number;
  onDismiss: () => void;
}

const SHOW_MS = 6000;

/** Announces how the map changed after an answer (PRD §5 F3; status changes via aria-live, §11.3). */
export function ChangeToast({ change, version, onDismiss }: ChangeToastProps) {
  useEffect(() => {
    if (!change) return;
    const t = window.setTimeout(onDismiss, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [change, version, onDismiss]);

  const text = change ? formatDiff(change) : "";
  const first = change?.removed[0] ?? change?.added[0] ?? change?.confirmed[0];

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
      {change && (
        <div
          key={version}
          className="pointer-events-auto rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] px-4 py-3 shadow-lg text-xs text-[var(--cw-text)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 duration-200"
        >
          <span className="font-semibold">{text || "Updated from your answer. No stations changed."}</span>
          {first && text && (
            <span className="block text-[11px] text-[var(--cw-text-muted)]">
              {change?.removed[0]
                ? `Removed: ${first.title}${first.reason ? `: ${first.reason}` : ""}`
                : change?.added[0]
                  ? `Added: ${first.title}`
                  : `Now applies: ${first.title}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
