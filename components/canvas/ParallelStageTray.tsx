"use client";

import React, { useState, useMemo } from "react";
import type { MetroVM } from "@/lib/graph/viewModel";
import type { ComposedJourney } from "@/lib/contract/compose";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import {
  buildStageTrayModel,
  type TrayFilter,
  type TrayItem,
} from "@/lib/graph/stageTray";

export interface ParallelStageTrayProps {
  metro: MetroVM | null;
  journey?: ComposedJourney | null;
  className?: string;
}

export function ParallelStageTray({
  metro,
  journey,
  className = "",
}: ParallelStageTrayProps) {
  const focusStage = useViewStore((s) => s.focusStage);
  const focusedStepId = useViewStore((s) => s.focusedStepId);
  const setFocusedStepId = useViewStore((s) => s.setFocusedStepId);
  const setHoveredStepId = useViewStore((s) => s.setHoveredStepId);

  const selectedStepId = useTaskStore((s) => s.selectedStepId);
  const selectStep = useTaskStore((s) => s.selectStep);

  const [activeFilter, setActiveFilter] = useState<TrayFilter>("all");
  const [manuallyClosedStage, setManuallyClosedStage] = useState<number | null>(null);
  const [forceExpanded, setForceExpanded] = useState(false);
  const [prevFocusStage, setPrevFocusStage] = useState(focusStage);

  // Reset manually closed state if stage changes (React render-phase pattern)
  if (focusStage !== prevFocusStage) {
    setPrevFocusStage(focusStage);
    setManuallyClosedStage(null);
    setForceExpanded(false);
    setActiveFilter("all");
  }

  const model = useMemo(() => {
    if (!metro) return null;
    return buildStageTrayModel({
      metro,
      stageNumber: focusStage,
      journey,
      filter: activeFilter,
    });
  }, [metro, focusStage, journey, activeFilter]);

  // Current station index in stage (1-based), computed before any early return
  const currentStationIndex = useMemo(() => {
    if (!model || !focusedStepId) return 1;
    const found = model.allOrderedItems.find((i) => i.station.id === focusedStepId);
    return found ? found.indexInStage : 1;
  }, [model, focusedStepId]);

  if (!model || model.totalStations <= 4) {
    // Stage tray only auto-opens / exists for big parallel stages with > 4 stations (§12.3)
    return null;
  }

  // Collapses to a tab while the drawer is open (§12.3), or if manually closed
  const isDrawerOpen = Boolean(selectedStepId);
  const isCollapsed = (!forceExpanded && isDrawerOpen) || manuallyClosedStage === focusStage;

  if (isCollapsed) {
    return (
      <button
        type="button"
        data-testid="stage-tray-tab"
        onClick={() => {
          setManuallyClosedStage(null);
          setForceExpanded(true);
        }}
        aria-label={`Open tray for ${model.totalStations} parallel steps`}
        className={`pointer-events-auto absolute top-16 left-0 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-r-xl border-y border-r border-[var(--cw-border)] bg-[var(--cw-surface)]/95 shadow-md backdrop-blur-md text-xs font-semibold text-[var(--cw-text)] hover:bg-[var(--cw-brand)] hover:text-white transition-colors cursor-pointer select-none ${className}`}
      >
        <span>{model.totalStations} steps</span>
        <span className="font-bold">›</span>
      </button>
    );
  }

  const handlePrevStation = () => {
    const prevIdx = currentStationIndex - 2;
    if (prevIdx >= 0) {
      const target = model.allOrderedItems[prevIdx];
      if (target) {
        setFocusedStepId(target.station.id);
        if (selectedStepId) selectStep(target.station.id);
      }
    }
  };

  const handleNextStation = () => {
    const nextIdx = currentStationIndex;
    if (nextIdx < model.allOrderedItems.length) {
      const target = model.allOrderedItems[nextIdx];
      if (target) {
        setFocusedStepId(target.station.id);
        if (selectedStepId) selectStep(target.station.id);
      }
    }
  };

  const handleSelectStation = (item: TrayItem) => {
    setFocusedStepId(item.station.id);
    if (selectedStepId) {
      selectStep(item.station.id);
    }
  };

  const filterButtons: Array<{ key: TrayFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: model.filterCounts.all },
    { key: "available", label: "Available", count: model.filterCounts.available },
    { key: "online", label: "Online", count: model.filterCounts.online },
    { key: "in_person", label: "In person", count: model.filterCounts.in_person },
    { key: "may_apply", label: "May apply", count: model.filterCounts.may_apply },
  ];

  return (
    <aside
      data-testid="parallel-stage-tray"
      aria-label="Parallel stage navigation tray"
      className={`pointer-events-auto absolute top-0 bottom-0 left-0 z-30 w-[300px] bg-[var(--cw-surface)]/95 backdrop-blur-md border-r border-[var(--cw-border)] shadow-xl flex flex-col select-none overflow-hidden ${className}`}
    >
      {/* Top Header: Title, Pager and Close Button */}
      <div className="p-3 border-b border-[var(--cw-border)] flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-1">
          <span className="font-semibold text-xs text-[var(--cw-text)] line-clamp-1">
            {model.title}
          </span>
          <button
            type="button"
            data-testid="stage-tray-close-btn"
            onClick={() => {
              setManuallyClosedStage(focusStage);
              setForceExpanded(false);
            }}
            aria-label="Close tray"
            className="text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] p-1 rounded hover:bg-black/5 cursor-pointer leading-none text-base shrink-0"
          >
            ×
          </button>
        </div>

        {/* Pager (3 of 15 with ‹ ›) */}
        <div className="flex items-center justify-between text-xs text-[var(--cw-text-muted)] px-1">
          <span className="font-medium text-[11px]">
            <strong className="text-[var(--cw-text)]">{currentStationIndex}</strong> of{" "}
            {model.totalStations}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="stage-tray-prev-btn"
              disabled={currentStationIndex <= 1}
              onClick={handlePrevStation}
              aria-label="Previous station in tray"
              className="px-1.5 py-0.5 rounded border border-[var(--cw-border)] bg-[var(--cw-surface)] text-xs font-bold hover:bg-black/5 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              ‹
            </button>
            <button
              type="button"
              data-testid="stage-tray-next-btn"
              disabled={currentStationIndex >= model.totalStations}
              onClick={handleNextStation}
              aria-label="Next station in tray"
              className="px-1.5 py-0.5 rounded border border-[var(--cw-border)] bg-[var(--cw-surface)] text-xs font-bold hover:bg-black/5 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              ›
            </button>
          </div>
        </div>

        {/* Filter chips with counts */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
          {filterButtons.map((btn) => {
            const isActive = activeFilter === btn.key;
            return (
              <button
                key={btn.key}
                type="button"
                data-testid={`stage-tray-filter-${btn.key}`}
                onClick={() => setActiveFilter(btn.key)}
                className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors cursor-pointer ${
                  isActive
                    ? "border-[var(--cw-brand)] bg-[var(--cw-brand)] text-white font-semibold shadow-2xs"
                    : "border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text-muted)] hover:text-[var(--cw-text)]"
                }`}
              >
                <span>{btn.label}</span>
                <span
                  className={`text-[9px] px-1 rounded-full ${
                    isActive ? "bg-white/20 text-white" : "bg-black/5 text-[var(--cw-text-muted)]"
                  }`}
                >
                  {btn.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Rows Grouped by Module */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-3">
        {model.groups.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--cw-text-muted)]">
            No steps match this filter.
          </div>
        ) : (
          model.groups.map((group) => (
            <div key={group.moduleId} className="flex flex-col gap-1">
              {/* Group Module Title Header */}
              <div className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--cw-text-muted)] bg-black/3 rounded">
                {group.moduleTitle}
              </div>

              {/* Step Rows */}
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const isFocused = focusedStepId === item.station.id;
                  const isSelected = selectedStepId === item.station.id;

                  return (
                    <div
                      key={item.station.id}
                      data-testid={`stage-tray-row-${item.station.id}`}
                      onClick={() => handleSelectStation(item)}
                      onMouseEnter={() => setHoveredStepId(item.station.id)}
                      onMouseLeave={() => setHoveredStepId(null)}
                      className={`flex flex-col gap-1 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? "border-[var(--cw-brand)] bg-[var(--cw-brand)]/10 ring-1 ring-[var(--cw-brand)]"
                          : isFocused
                          ? "border-[var(--cw-brand)]/60 bg-[var(--cw-surface-muted)] shadow-xs"
                          : "border-[var(--cw-border)]/70 bg-[var(--cw-surface)] hover:border-[var(--cw-border)] hover:bg-[var(--cw-surface-muted)]/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {/* Number badge */}
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-[var(--cw-surface-muted)] border border-[var(--cw-border)] font-mono text-[10px] font-bold text-[var(--cw-text)]">
                          {item.numberLabel}
                        </span>

                        {/* Title */}
                        <span className="font-medium text-[11px] text-[var(--cw-text)] line-clamp-1 flex-1">
                          {item.station.title}
                        </span>

                        {/* Done status icon */}
                        {item.isDone && (
                          <span className="shrink-0 text-[#1E7F3B] font-bold text-xs" title="Complete">
                            ✓
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-[var(--cw-text-muted)] pl-7">
                        {/* Mode badge */}
                        <span className="capitalize">
                          {item.mode ? item.mode.replace("_", " ") : "Action"}
                        </span>

                        {/* Fee hint */}
                        <span className="font-medium text-[var(--cw-text)]">
                          {item.feeHint}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
