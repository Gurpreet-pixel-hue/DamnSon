import React, { useMemo } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import { summarizeFees, summarizeTime, type FeeSummary, type TimeSummary } from "@/lib/graph/totals";
import { planOfficeTrips, type OfficeTrip } from "@/lib/graph/trips";
import { deriveStepStates, nextUpStepIds } from "@/lib/graph/progress";
import { formatFees, formatTime, formatNextUp, formatOfficeVisits } from "@/lib/graph/summary";

export interface JourneySummaryValues {
  feeSummary: FeeSummary;
  timeSummary: TimeSummary;
  trips: OfficeTrip[];
  nextUpIds: string[];
  nextUpText: string;
  feesText: string;
  timeText: string;
  officeVisitsText: string;
}

export function checkAllRemainingOnline(
  journey: ComposedJourney,
  completed: ReadonlySet<string>
): boolean {
  let hasRemaining = false;
  for (const step of journey.steps) {
    if (step.kind === "milestone") continue;
    if (step.applicability === "optional" || step.requirement.kind === "optional") continue;
    if (completed.has(step.id)) continue;
    hasRemaining = true;
    if (step.mode !== "online") {
      return false;
    }
  }
  return hasRemaining;
}

export function deriveSummaryValues(
  journey: ComposedJourney,
  completed: ReadonlySet<string> = new Set()
): JourneySummaryValues {
  const stepStates = deriveStepStates(journey, completed);
  const nextUpIds = nextUpStepIds(journey, stepStates);
  const stepTitles = new Map(journey.steps.map((s) => [s.id, s.title]));

  const feeSummary = summarizeFees(journey, completed);
  const timeSummary = summarizeTime(journey, completed);
  const trips = planOfficeTrips(journey);
  const allRemainingOnline = checkAllRemainingOnline(journey, completed);

  const nextUpText = formatNextUp(nextUpIds, stepTitles);
  const feesText = formatFees(feeSummary);
  const timeText = formatTime(timeSummary, stepTitles);
  const officeVisitsText = formatOfficeVisits(trips, { allRemainingOnline });

  return {
    feeSummary,
    timeSummary,
    trips,
    nextUpIds,
    nextUpText,
    feesText,
    timeText,
    officeVisitsText,
  };
}

export interface SummaryTileProps {
  label: string;
  value: string;
  subtext?: string;
  className?: string;
  testId?: string;
}

export function SummaryTile({ label, value, subtext, className = "", testId }: SummaryTileProps) {
  return (
    <div
      data-testid={testId}
      className={`flex flex-col justify-center px-3 py-1.5 rounded-lg bg-[var(--cw-surface)] border border-[var(--cw-border)] shadow-xs transition-colors min-w-0 ${className}`}
      title={value}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)] truncate">
        {label}
      </span>
      <span className="text-xs sm:text-sm font-medium text-[var(--cw-text)] truncate leading-tight mt-0.5">
        {value}
      </span>
      {subtext && (
        <span className="text-[10px] text-[var(--cw-text-muted)] truncate mt-0.5">
          {subtext}
        </span>
      )}
    </div>
  );
}

export interface SummaryBarProps {
  journey: ComposedJourney;
  completed?: ReadonlySet<string>;
  className?: string;
}

export function SummaryBar({ journey, completed = new Set(), className = "" }: SummaryBarProps) {
  const summary = useMemo(() => deriveSummaryValues(journey, completed), [journey, completed]);

  return (
    <div
      data-testid="summary-bar"
      className={`grid grid-cols-2 md:grid-cols-4 gap-2 ${className}`}
    >
      <SummaryTile
        testId="tile-next-up"
        label="Next up"
        value={summary.nextUpText}
      />
      <SummaryTile
        testId="tile-fees"
        label="Estimated fee"
        value={summary.feesText}
      />
      <SummaryTile
        testId="tile-time"
        label="Total time"
        value={summary.timeText}
      />
      <SummaryTile
        testId="tile-visits"
        label="Office visits"
        value={summary.officeVisitsText}
      />
    </div>
  );
}
