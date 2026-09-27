"use client";

import React, { useMemo } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import { buildDocumentChecklist, type DocumentChecklistEntry } from "@/lib/graph/documents";
import { deriveStepStates } from "@/lib/graph/progress";
import { useTaskStore } from "@/lib/store/useTaskStore";

export interface DocumentChecklistProps {
  journey: ComposedJourney;
  completed: ReadonlySet<string>;
}

interface Group {
  name: string;
  online: boolean;
  entries: (DocumentChecklistEntry & { neededNow: boolean })[];
}

const EMPTY: string[] = [];

/**
 * Documents still needed for unfinished steps (PRD §5 F9), grouped by the office or department of the
 * first step that needs them, and marked "needed now" or "needed later" from the step states. On-device only.
 */
export function DocumentChecklist({ journey, completed }: DocumentChecklistProps) {
  const taskId = journey.taskId;
  const heldList = useTaskStore((s) => s.documentsHeldByTask[taskId] ?? EMPTY);
  const toggle = useTaskStore((s) => s.toggleDocumentHeld);
  const held = useMemo(() => new Set(heldList), [heldList]);

  const entries = useMemo(() => buildDocumentChecklist(journey, completed), [journey, completed]);
  const states = useMemo(() => deriveStepStates(journey, completed), [journey, completed]);
  const steps = useMemo(() => new Map(journey.steps.map((s) => [s.id, s])), [journey]);

  const groups = useMemo(() => {
    const byName = new Map<string, Group>();
    const out: Group[] = [];
    for (const entry of entries) {
      const first = steps.get(entry.usedIn[0] ?? "");
      const action = first && first.kind !== "milestone" ? first : undefined;
      const name = action ? (action.office?.name ?? action.department) : "Other";
      let group = byName.get(name);
      if (!group) {
        group = { name, online: action?.mode === "online", entries: [] };
        byName.set(name, group);
        out.push(group);
      }
      const neededNow = entry.usedIn.some((id) => states.get(id) === "available");
      group.entries.push({ ...entry, neededNow });
    }
    return out;
  }, [entries, states, steps]);

  const ready = entries.filter((e) => held.has(e.key)).length;

  if (entries.length === 0) {
    return <p className="text-xs text-[var(--cw-text-muted)]">No documents are needed for the remaining steps.</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="document-checklist">
      <p className="text-xs text-[var(--cw-text-muted)]" aria-live="polite">
        {ready} of {entries.length} ready · kept on this device only
      </p>
      {groups.map((group) => (
        <section key={group.name} className="flex flex-col gap-2" data-testid="document-group">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cw-text-muted)]">
            {group.name}
            {group.online ? " · online" : ""}
          </h3>
          <ul className="flex flex-col gap-2">
            {group.entries.map((entry) => {
              const isHeld = held.has(entry.key);
              const usedIn = entry.usedIn.map((id) => steps.get(id)?.title ?? id);
              const producedBy = entry.producedBy.map((id) => steps.get(id)?.title ?? id);
              return (
                <li key={entry.key}>
                  <label className="flex gap-3 items-start rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] px-3 py-2 cursor-pointer hover:bg-[var(--cw-surface-muted)]">
                    <input
                      type="checkbox"
                      checked={isHeld}
                      onChange={() => toggle(taskId, entry.key)}
                      className="mt-0.5 h-4 w-4 accent-[var(--cw-done)]"
                    />
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-semibold ${isHeld ? "text-[var(--cw-done)] line-through" : "text-[var(--cw-text)]"}`}
                        >
                          {entry.label}
                        </span>
                        {!isHeld && (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              entry.neededNow
                                ? "bg-[var(--cw-available)]/10 text-[var(--cw-available)]"
                                : "bg-[var(--cw-locked)]/10 text-[var(--cw-locked)]"
                            }`}
                          >
                            {entry.neededNow ? "Needed now" : "Needed later"}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-[var(--cw-text-muted)]">
                        Used in {usedIn.length} step{usedIn.length === 1 ? "" : "s"}: {usedIn.join(", ")}
                      </span>
                      {producedBy.length > 0 && (
                        <span className="text-[11px] text-[var(--cw-available)]">
                          You&apos;ll get this from: {producedBy.join(", ")}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
