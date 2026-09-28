"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { useViewStore } from "@/lib/store/useViewStore";
import { getStages, currentStage } from "@/lib/graph/stages";
import { fromJourney } from "@/lib/graph/viewModel";
import { buildStepDrawerModel } from "@/lib/graph/drawerModel";
import { StepExplain } from "@/components/hud/StepExplain";
import { CopilotPanel } from "@/components/hud/CopilotPanel";

export interface RightDrawerProps {
  journey?: ComposedJourney;
  className?: string;
  /** Render the "Ask about this step" box. Off unless the intelligence service is configured. */
  copilotEnabled?: boolean;
}

type DrawerTab = "overview" | "documents" | "fees" | "sources";

let autoAdvanceTimeout: ReturnType<typeof setTimeout> | null = null;

export function cancelAutoAdvance() {
  if (autoAdvanceTimeout) {
    clearTimeout(autoAdvanceTimeout);
    autoAdvanceTimeout = null;
  }
}

export function RightDrawer({ journey, className = "", copilotEnabled = false }: RightDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("overview");
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);

  const selectedStepId = useTaskStore((s) => s.selectedStepId);
  const selectStep = useTaskStore((s) => s.selectStep);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const toggleStepDone = useTaskStore((s) => s.toggleStepDone);
  const completedByTask = useTaskStore((s) => s.completedByTask);
  const documentChecklistByTask = useTaskStore((s) => s.documentChecklist);
  const toggleDocumentCheck = useTaskStore((s) => s.toggleDocumentCheck);
  const showUndoToast = useViewStore((s) => s.showUndoToast);

  if (selectedStepId !== prevSelectedId) {
    setPrevSelectedId(selectedStepId);
    if (selectedStepId) {
      setActiveTab("overview");
    }
  }

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

  const completedSet = useMemo(
    () => new Set(activeTaskId ? completedByTask[activeTaskId] ?? [] : []),
    [activeTaskId, completedByTask]
  );

  const documentChecklist = useMemo(
    () => (activeTaskId ? documentChecklistByTask[activeTaskId] ?? {} : {}),
    [activeTaskId, documentChecklistByTask]
  );

  const model = useMemo(() => {
    if (!step || !journey) return null;
    return buildStepDrawerModel(step, journey, completedSet, documentChecklist);
  }, [step, journey, completedSet, documentChecklist]);

  const handleToggleDone = () => {
    if (!activeTaskId || !step || !model || model.isLocked) return;
    const currentFocus = useViewStore.getState().focusStage;

    if (model.isAvailable) {
      toggleStepDone(activeTaskId, step.id);
      showUndoToast({
        taskId: activeTaskId,
        stepId: step.id,
        title: step.title,
        previousFocusStage: currentFocus,
      });

      if (journey) {
        const nextCompleted = new Set(completedSet);
        nextCompleted.add(step.id);
        const nextMetro = fromJourney(journey, nextCompleted);
        const stages = getStages(nextMetro);
        const currentStageInfo = stages.find((s) => s.number === currentFocus);
        if (!currentStageInfo || !currentStageInfo.hasAvailable) {
          cancelAutoAdvance();
          autoAdvanceTimeout = setTimeout(() => {
            autoAdvanceTimeout = null;
            const isStillDone =
              useTaskStore.getState().completedByTask[activeTaskId]?.includes(step.id);
            if (isStillDone && useViewStore.getState().focusStage === currentFocus) {
              const next = currentStage(nextMetro);
              useViewStore.getState().setFocusStage(next);
            }
          }, 700);
        }
      }
    } else if (model.isDone) {
      toggleStepDone(activeTaskId, step.id);
    }
  };

  return (
    <aside
      data-testid="right-drawer"
      data-state={isOpen ? "open" : "closed"}
      aria-label="Step details inspector"
      className={`absolute right-0 top-0 bottom-0 z-40 w-[380px] overflow-hidden rounded-r-2xl border-l border-[var(--cw-border)] bg-[var(--cw-surface)] shadow-2xl transition-transform duration-240 ease-out motion-reduce:transition-none flex flex-col ${
        isOpen
          ? "translate-x-0 opacity-100 pointer-events-auto"
          : "translate-x-full opacity-0 pointer-events-none"
      } ${className}`}
    >
      {isOpen && model && (
        <div className="w-[380px] h-full flex flex-col justify-between overflow-hidden">
          {/* Top Header */}
          <div className="p-4 border-b border-[var(--cw-border)]/70 flex flex-col gap-2 shrink-0 bg-[var(--cw-surface)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--cw-text-muted)]">
                  {model.department}
                </span>
                <h2 className="text-sm font-bold text-[var(--cw-text)] tracking-tight leading-snug">
                  {model.title}
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
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                  model.isDone
                    ? "bg-[#1E7F3B]/10 text-[#1E7F3B]"
                    : model.isAvailable
                    ? "bg-[#1F63D6]/10 text-[#1F63D6]"
                    : "bg-[var(--cw-border)]/40 text-[var(--cw-text-muted)]"
                }`}
              >
                {model.isDone ? "Completed" : model.isAvailable ? "Available" : "Locked"}
              </span>

              {model.modeLabel && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--cw-border)]/30 text-[var(--cw-text-muted)]">
                  {model.modeLabel}
                </span>
              )}

              {model.sources.review && (
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                    model.sources.review.status === "verified"
                      ? "bg-green-500/10 text-green-700 dark:text-green-300"
                      : model.sources.review.status === "flagged"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {model.sources.review.statusLabel}
                </span>
              )}
            </div>

            {/* 4 Tabs Bar */}
            <nav
              data-testid="drawer-tabs"
              aria-label="Step details tabs"
              className="grid grid-cols-4 gap-1 p-0.5 mt-2 bg-[var(--cw-background)] rounded-lg border border-[var(--cw-border)]/60 text-xs font-medium"
            >
              <button
                type="button"
                data-testid="drawer-tab-overview"
                onClick={() => setActiveTab("overview")}
                className={`py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  activeTab === "overview"
                    ? "bg-[var(--cw-surface)] text-[var(--cw-text)] shadow-xs"
                    : "text-[var(--cw-text-muted)] hover:text-[var(--cw-text)]"
                }`}
              >
                Overview
              </button>
              <button
                type="button"
                data-testid="drawer-tab-documents"
                onClick={() => setActiveTab("documents")}
                className={`py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  activeTab === "documents"
                    ? "bg-[var(--cw-surface)] text-[var(--cw-text)] shadow-xs"
                    : "text-[var(--cw-text-muted)] hover:text-[var(--cw-text)]"
                }`}
              >
                Docs {model.documents.documents.length > 0 && `(${model.documents.documents.length})`}
              </button>
              <button
                type="button"
                data-testid="drawer-tab-fees"
                onClick={() => setActiveTab("fees")}
                className={`py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  activeTab === "fees"
                    ? "bg-[var(--cw-surface)] text-[var(--cw-text)] shadow-xs"
                    : "text-[var(--cw-text-muted)] hover:text-[var(--cw-text)]"
                }`}
              >
                Fees & SLA
              </button>
              <button
                type="button"
                data-testid="drawer-tab-sources"
                onClick={() => setActiveTab("sources")}
                className={`py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  activeTab === "sources"
                    ? "bg-[var(--cw-surface)] text-[var(--cw-text)] shadow-xs"
                    : "text-[var(--cw-text-muted)] hover:text-[var(--cw-text)]"
                }`}
              >
                Source {model.sources.sources.length > 0 && `(${model.sources.sources.length})`}
              </button>
            </nav>
          </div>

          {/* Tab Content Area (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs">
            {/* 1. OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div data-testid="drawer-tab-panel-overview" className="flex flex-col gap-3.5">
                {/* Description (hidden if empty) */}
                {model.overview.description && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                      Summary
                    </span>
                    <p className="text-xs text-[var(--cw-text)] leading-relaxed bg-[var(--cw-background)]/60 p-2.5 rounded-lg border border-[var(--cw-border)]/40">
                      {model.overview.description}
                    </p>
                  </div>
                )}

                {/* Requirement */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                    Requirement
                  </span>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border border-[var(--cw-border)]/50 bg-[var(--cw-background)]">
                    {model.overview.requirement.kind === "mandatory" ? (
                      <span className="font-semibold text-[var(--cw-text)]">
                        {model.overview.requirement.text}
                      </span>
                    ) : (
                      <>
                        <span className="font-semibold text-[var(--cw-text)] capitalize">
                          {model.overview.requirement.kind}:
                        </span>
                        <span className="text-[var(--cw-text-muted)]">
                          {model.overview.requirement.text}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Office Card (only for in_person / hybrid) */}
                {model.overview.office && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                      Office Location
                    </span>
                    <div className="p-3 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-background)] flex flex-col gap-2">
                      <div className="font-semibold text-[var(--cw-text)]">
                        {model.overview.office.name}
                      </div>
                      <div className="text-[var(--cw-text-muted)] space-y-0.5">
                        <div>{model.overview.office.address}</div>
                        {model.overview.office.ward && (
                          <div>Ward: {model.overview.office.ward}</div>
                        )}
                        <div>Hours: {model.overview.office.hours}</div>
                      </div>
                      {model.overview.office.mapsUrl ? (
                        <a
                          href={model.overview.office.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[var(--cw-brand)] hover:underline font-semibold mt-1"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>Open in Google Maps</span>
                        </a>
                      ) : (
                        <div className="text-[10px] text-[var(--cw-text-muted)] font-medium">
                          {model.overview.office.locationNote}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Online Portal Card */}
                {model.overview.portal && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                      Application Portal
                    </span>
                    <div className="p-3 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-background)] flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--cw-text)]">
                        {model.overview.portal.name}
                      </span>
                      {model.overview.portal.url ? (
                        <a
                          href={model.overview.portal.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--cw-brand)] hover:underline font-semibold"
                        >
                          <span>Visit portal</span>
                          <svg
                            className="w-3 h-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      ) : (
                        <span className="text-[10px] text-[var(--cw-text-muted)]">
                          Portal not verified
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Forms Section */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                    Official Forms
                  </span>
                  {model.overview.forms.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {model.overview.forms.map((f, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-lg border border-[var(--cw-border)]/60 bg-[var(--cw-background)] flex items-center justify-between gap-2"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-[var(--cw-text)] truncate">
                              {f.name}
                            </span>
                            {f.code && (
                              <span className="text-[10px] text-[var(--cw-text-muted)]">
                                Code: {f.code}
                              </span>
                            )}
                          </div>
                          {f.url && (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--cw-brand)] hover:underline text-[11px] font-semibold shrink-0 flex items-center gap-1"
                            >
                              <span>View</span>
                              <svg
                                className="w-3 h-3"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg border border-[var(--cw-border)]/40 bg-[var(--cw-background)]/60 text-[var(--cw-text-muted)] italic">
                      {model.overview.emptyFormsMessage}
                    </div>
                  )}
                </div>

                {/* Why this step explanation (B4) */}
                {journey && selectedStepId && (
                  <StepExplain journey={journey} stepId={selectedStepId} />
                )}

                {/* Ask about this step (B5): only when the intelligence service is configured */}
                {copilotEnabled && journey && selectedStepId && (
                  <div className="mt-2 pt-2 border-t border-[var(--cw-border)]/60">
                    <CopilotPanel
                      taskId={journey.taskId}
                      stepId={selectedStepId}
                      stepTitle={model.title}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 2. DOCUMENTS TAB */}
            {activeTab === "documents" && (
              <div data-testid="drawer-tab-panel-documents" className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                    Required Checklist ({model.documents.documents.length})
                  </span>
                  {model.documents.documents.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {model.documents.documents.map((doc) => (
                        <label
                          key={doc.key}
                          data-testid={`document-item-${doc.key}`}
                          className={`p-3 rounded-lg border transition-colors flex items-start gap-2.5 cursor-pointer select-none ${
                            doc.isChecked
                              ? "border-[var(--cw-done)]/40 bg-[var(--cw-done)]/5"
                              : "border-[var(--cw-border)] bg-[var(--cw-background)] hover:border-[var(--cw-border)]/80"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={doc.isChecked}
                            onChange={() => {
                              if (activeTaskId) {
                                toggleDocumentCheck(activeTaskId, doc.key);
                              }
                            }}
                            className="mt-0.5 rounded border-[var(--cw-border)] text-[var(--cw-brand)] focus:ring-[var(--cw-brand)] shrink-0"
                          />
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span
                              className={`font-semibold text-xs leading-snug ${
                                doc.isChecked
                                  ? "line-through text-[var(--cw-text-muted)]"
                                  : "text-[var(--cw-text)]"
                              }`}
                            >
                              {doc.label}
                            </span>
                            <div className="text-[10px] text-[var(--cw-text-muted)] flex flex-wrap gap-2">
                              {doc.acceptedFormats && <span>Format: {doc.acceptedFormats}</span>}
                              {doc.maxSize && <span>Size: {doc.maxSize}</span>}
                            </div>
                            {doc.note && (
                              <p className="text-[10px] text-[var(--cw-text-muted)] mt-0.5">
                                {doc.note}
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg border border-[var(--cw-border)]/40 bg-[var(--cw-background)]/60 text-[var(--cw-text-muted)] italic">
                      {model.documents.emptyMessage}
                    </div>
                  )}
                </div>

                {/* Outputs Produced */}
                {model.documents.outputs.length > 0 && (
                  <div className="flex flex-col gap-1 mt-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                      Outputs Issued
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {model.documents.outputs.map((out, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-lg border border-green-500/20 bg-green-500/5 text-xs text-green-900 dark:text-green-200 flex items-center gap-2"
                        >
                          <svg
                            className="w-3.5 h-3.5 text-green-600 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span className="font-medium">{out.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. FEES & SLA TAB */}
            {activeTab === "fees" && (
              <div data-testid="drawer-tab-panel-fees" className="flex flex-col gap-3.5">
                {/* Official Fee Card */}
                <div className="p-3.5 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-background)] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                      Official Fee
                    </span>
                    {model.fees.feeRecurrenceLabel && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--cw-border)]/30 text-[var(--cw-text-muted)]">
                        {model.fees.feeRecurrenceLabel}
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-bold text-[var(--cw-text)] tracking-tight">
                    {model.fees.feeDisplayText}
                  </div>
                  {model.fees.feeNote && (
                    <div className="text-[11px] text-[var(--cw-text-muted)] border-t border-[var(--cw-border)]/40 pt-1.5">
                      {model.fees.feeNote}
                    </div>
                  )}
                </div>

                {/* Official SLA Card */}
                <div className="p-3.5 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-background)] flex flex-col gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                    Official SLA Timeline
                  </span>
                  <div className="text-lg font-bold text-[var(--cw-text)] tracking-tight">
                    {model.fees.slaDisplayText}
                  </div>
                  {model.fees.slaWording && (
                    <div className="text-[11px] text-[var(--cw-text-muted)] border-t border-[var(--cw-border)]/40 pt-1.5">
                      {model.fees.slaWording}
                    </div>
                  )}
                </div>

                {/* Conditional Timelines */}
                {model.fees.conditionalTimelines.length > 0 && (
                  <div className="flex flex-col gap-1 mt-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                      Conditional Variations
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {model.fees.conditionalTimelines.map((ct, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-lg border border-[var(--cw-border)]/60 bg-[var(--cw-background)] flex flex-col gap-0.5"
                        >
                          <span className="font-semibold text-[var(--cw-text)]">
                            {ct.durationText}
                          </span>
                          <span className="text-[10px] text-[var(--cw-text-muted)]">
                            {ct.condition}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. SOURCE TAB */}
            {activeTab === "sources" && (
              <div data-testid="drawer-tab-panel-sources" className="flex flex-col gap-3.5">
                {/* Review state card */}
                {model.sources.review && (
                  <div className="p-3 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-background)] flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                        Verification Status
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          model.sources.review.status === "verified"
                            ? "bg-green-500/10 text-green-700 dark:text-green-300"
                            : model.sources.review.status === "flagged"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {model.sources.review.statusLabel}
                      </span>
                    </div>
                    {model.sources.review.verifiedOn && (
                      <div className="text-[11px] font-medium text-[var(--cw-text)]">
                        {model.sources.review.verifiedOn}
                      </div>
                    )}
                    {model.sources.review.note && (
                      <div className="text-[11px] text-[var(--cw-text-muted)]">
                        {model.sources.review.note}
                      </div>
                    )}
                  </div>
                )}

                {/* Sources list */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)]">
                    Official References ({model.sources.sources.length})
                  </span>
                  {model.sources.sources.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {model.sources.sources.map((src) => (
                        <div
                          key={src.id}
                          className="p-3 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-background)] flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-xs text-[var(--cw-text)] leading-snug">
                              {src.title}
                            </span>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                                src.isOfficial
                                  ? "bg-green-500/10 text-green-700 border border-green-500/20"
                                  : "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                              }`}
                            >
                              {src.isOfficial ? "Official Source" : "Unofficial Source"}
                            </span>
                          </div>

                          <div className="text-[10px] text-[var(--cw-text-muted)] flex flex-col gap-0.5">
                            <div className="font-mono">{src.domain}</div>
                            <div>Type: {src.kindLabel}</div>
                            <div>{src.retrievedOn}</div>
                            {src.lastCheckedOn && <div>{src.lastCheckedOn}</div>}
                          </div>

                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[var(--cw-brand)] hover:underline text-[11px] font-semibold mt-1"
                          >
                            <span>Open source URL</span>
                            <svg
                              className="w-3 h-3"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg border border-[var(--cw-border)]/40 bg-[var(--cw-background)]/60 text-[var(--cw-text-muted)] italic">
                      {model.sources.emptyMessage}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Action Footer */}
          <div className="p-4 border-t border-[var(--cw-border)]/70 flex flex-col gap-2 shrink-0 bg-[var(--cw-surface)]">
            {model.kind !== "milestone" && activeTaskId ? (
              <button
                type="button"
                data-testid="drawer-mark-done-btn"
                disabled={model.isLocked}
                onClick={handleToggleDone}
                className={`w-full py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-xs ${
                  model.isLocked
                    ? "bg-[var(--cw-border)]/30 text-[var(--cw-text-muted)] cursor-not-allowed border border-[var(--cw-border)]"
                    : model.isDone
                    ? "bg-[var(--cw-border)]/50 text-[var(--cw-text)] hover:bg-[var(--cw-border)]"
                    : "bg-[var(--cw-brand)] text-white hover:opacity-90"
                }`}
              >
                {model.isDone ? "Mark as not done" : "Mark as complete"}
              </button>
            ) : model.kind === "milestone" ? (
              <div className="p-2 rounded-lg bg-[var(--cw-background)] border border-[var(--cw-border)]/60 text-[10px] text-center text-[var(--cw-text-muted)] font-medium">
                Milestones complete automatically when all prerequisites are done.
              </div>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}
