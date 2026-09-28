"use client";

import React, { useMemo } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import {
  buildDocumentChecklist,
  type DocumentChecklistEntry,
} from "@/lib/graph/documents";
import { deriveStepStates } from "@/lib/graph/progress";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { useViewStore } from "@/lib/store/useViewStore";

export interface DocumentsPanelProps {
  journey: ComposedJourney;
  completed: ReadonlySet<string>;
  onClose?: () => void;
}

interface DocumentGroup {
  name: string;
  online: boolean;
  entries: (DocumentChecklistEntry & { neededNow: boolean })[];
}

const EMPTY_CHECKLIST: Record<string, boolean> = {};

/**
 * Documents Panel overlay (B3, #9):
 * Documents grouped by office, separated into needed now vs later, with output origin and on-device checklist.
 */
export function DocumentsPanel({
  journey,
  completed,
  onClose,
}: DocumentsPanelProps) {
  const taskId = journey.taskId;
  const documentChecklist = useTaskStore((s) => s.documentChecklist);
  const checklistState = documentChecklist[taskId] ?? EMPTY_CHECKLIST;
  const toggleDocumentCheck = useTaskStore((s) => s.toggleDocumentCheck);
  const selectStep = useTaskStore((s) => s.selectStep);
  const setFocusedStepId = useViewStore((s) => s.setFocusedStepId);

  const entries = useMemo(
    () => buildDocumentChecklist(journey, completed),
    [journey, completed]
  );
  const states = useMemo(
    () => deriveStepStates(journey, completed),
    [journey, completed]
  );
  const steps = useMemo(
    () => new Map(journey.steps.map((s) => [s.id, s])),
    [journey.steps]
  );

  const groups = useMemo(() => {
    const byName = new Map<string, DocumentGroup>();
    const out: DocumentGroup[] = [];
    for (const entry of entries) {
      const first = steps.get(entry.usedIn[0] ?? "");
      const action = first && first.kind !== "milestone" ? first : undefined;
      const name = action ? action.office?.name ?? action.department : "General";
      let group = byName.get(name);
      if (!group) {
        group = { name, online: action?.mode === "online", entries: [] };
        byName.set(name, group);
        out.push(group);
      }
      const neededNow = entry.usedIn.some(
        (id) => states.get(id) === "available"
      );
      group.entries.push({ ...entry, neededNow });
    }
    return out;
  }, [entries, states, steps]);

  const readyCount = entries.filter((e) => checklistState[e.key] === true).length;

  const handleStepClick = (stepId: string) => {
    selectStep(stepId);
    setFocusedStepId(stepId);
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden bg-[var(--cw-surface)] text-[var(--cw-text)] text-xs"
      data-testid="documents-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--cw-border)] bg-[var(--cw-surface-muted)]/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-[var(--cw-text)]">
            Documents
          </span>
          <span className="text-[11px] font-medium text-[var(--cw-text-muted)]">
            · {readyCount} of {entries.length} ready
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] hover:bg-[var(--cw-surface)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cw-focus)]"
            aria-label="Close Documents panel"
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
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        <p className="text-[11px] text-[var(--cw-text-muted)] leading-relaxed" aria-live="polite">
          Kept on this device only. Check off what you have prepared to track your readiness.
        </p>

        {entries.length === 0 ? (
          <div className="rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface-muted)]/30 p-4 text-center">
            <p className="text-xs text-[var(--cw-text-muted)]">
              No documents are needed for the remaining steps.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <section
              key={group.name}
              className="flex flex-col gap-2"
              data-testid="document-group"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
                  {group.name}
                </h3>
                {group.online && (
                  <span className="text-[10px] text-[var(--cw-text-muted)] font-medium">
                    Online upload
                  </span>
                )}
              </div>

              <ul className="flex flex-col gap-2">
                {group.entries.map((entry) => {
                  const isChecked = checklistState[entry.key] === true;
                  const usedInSteps = entry.usedIn
                    .map((id) => steps.get(id))
                    .filter((s): s is NonNullable<typeof s> => !!s);
                  const producedBySteps = entry.producedBy
                    .map((id) => steps.get(id))
                    .filter((s): s is NonNullable<typeof s> => !!s);

                  return (
                    <li key={entry.key}>
                      <div
                        className={`flex gap-3 items-start rounded-xl border p-3 transition-colors ${
                          isChecked
                            ? "border-[var(--cw-border)] bg-[var(--cw-surface-muted)]/40 opacity-75"
                            : "border-[var(--cw-border)] bg-[var(--cw-surface)] hover:bg-[var(--cw-surface-muted)]/30"
                        }`}
                      >
                        <input
                          type="checkbox"
                          id={`doc-${entry.key}`}
                          checked={isChecked}
                          onChange={() => toggleDocumentCheck(taskId, entry.key)}
                          className="mt-0.5 h-4 w-4 rounded border-[var(--cw-border)] accent-[var(--cw-done)] focus-visible:ring-1 focus-visible:ring-[var(--cw-focus)] cursor-pointer"
                        />
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap justify-between">
                            <label
                              htmlFor={`doc-${entry.key}`}
                              className={`text-xs font-semibold cursor-pointer select-none ${
                                isChecked
                                  ? "text-[var(--cw-done)] line-through"
                                  : "text-[var(--cw-text)]"
                              }`}
                            >
                              {entry.label}
                            </label>
                            {!isChecked && (
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                  entry.neededNow
                                    ? "bg-[var(--cw-available)]/10 text-[var(--cw-available)]"
                                    : "bg-[var(--cw-locked)]/10 text-[var(--cw-text-muted)]"
                                }`}
                              >
                                {entry.neededNow ? "Needed now" : "Needed later"}
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-[var(--cw-text-muted)] flex flex-wrap gap-1 items-center">
                            <span>Used in:</span>
                            {usedInSteps.map((step, idx) => (
                              <React.Fragment key={step.id}>
                                <button
                                  type="button"
                                  onClick={() => handleStepClick(step.id)}
                                  className="underline hover:text-[var(--cw-text)] text-left focus-visible:outline-none"
                                >
                                  {step.title}
                                </button>
                                {idx < usedInSteps.length - 1 && <span>,</span>}
                              </React.Fragment>
                            ))}
                          </div>

                          {producedBySteps.length > 0 && (
                            <div className="text-[11px] text-[var(--cw-accent)] flex flex-wrap gap-1 items-center mt-0.5">
                              <span>You&apos;ll get this from:</span>
                              {producedBySteps.map((step, idx) => (
                                <React.Fragment key={step.id}>
                                  <button
                                    type="button"
                                    onClick={() => handleStepClick(step.id)}
                                    className="font-medium underline hover:text-[var(--cw-accent)] text-left focus-visible:outline-none"
                                  >
                                    {step.title}
                                  </button>
                                  {idx < producedBySteps.length - 1 && <span>,</span>}
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
