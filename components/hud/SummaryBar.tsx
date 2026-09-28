import React, { useMemo } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import { summarizeFees, summarizeTime, type FeeSummary, type TimeSummary } from "@/lib/graph/totals";
import { planOfficeTrips, type OfficeTrip } from "@/lib/graph/trips";
import { deriveStepStates, nextUpStepIds } from "@/lib/graph/progress";
import {
  formatFees,
  formatTime,
  formatNextUp,
  formatOfficeVisits,
  deriveFeeTile,
  deriveTimeTile,
} from "@/lib/graph/summary";

export interface TileValue {
  value: string;
  subtext?: string;
  fullText: string;
}

export interface JourneySummaryValues {
  feeSummary: FeeSummary;
  timeSummary: TimeSummary;
  trips: OfficeTrip[];
  nextUpIds: string[];
  nextUpText: string;
  feesText: string;
  timeText: string;
  officeVisitsText: string;
  // Two-line tile values per A5
  nextUpTile: TileValue;
  feesTile: TileValue;
  timeTile: TileValue;
  visitsTile: TileValue;
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

  // A5: Two lines per tile
  // 1. Next up tile
  let nextUpTile: TileValue;
  if (nextUpIds.length === 0) {
    nextUpTile = { value: "All steps done", fullText: "All steps done" };
  } else if (nextUpIds.length === 1) {
    const firstTitle = stepTitles.get(nextUpIds[0]!) ?? nextUpIds[0]!;
    nextUpTile = { value: firstTitle, fullText: firstTitle };
  } else if (nextUpIds.length === 2) {
    const firstTitle = stepTitles.get(nextUpIds[0]!) ?? nextUpIds[0]!;
    nextUpTile = {
      value: firstTitle,
      subtext: "Do these in parallel",
      fullText: nextUpText,
    };
  } else {
    const firstTitle = stepTitles.get(nextUpIds[0]!) ?? nextUpIds[0]!;
    nextUpTile = {
      value: firstTitle,
      subtext: `+${nextUpIds.length - 1} more`,
      fullText: nextUpText,
    };
  }

  // 2. Fee tile
  const feesTile = deriveFeeTile(feeSummary);

  // 3. Time tile
  const timeTile = deriveTimeTile(timeSummary, stepTitles);

  // 4. Visits tile
  let visitsTile: TileValue;
  if (trips.length === 0) {
    const val = allRemainingOnline ? "100 % online" : "No office visits";
    visitsTile = { value: val, fullText: val };
  } else {
    const val = `${trips.length} ${trips.length === 1 ? "visit" : "visits"}`;
    const offices = new Set(trips.map((t) => t.name)).size;
    const sub = `across ${offices} ${offices === 1 ? "office" : "offices"}`;
    visitsTile = {
      value: val,
      subtext: sub,
      fullText: `${officeVisitsText} (${sub})`,
    };
  }

  return {
    feeSummary,
    timeSummary,
    trips,
    nextUpIds,
    nextUpText,
    feesText,
    timeText,
    officeVisitsText,
    nextUpTile,
    feesTile,
    timeTile,
    visitsTile,
  };
}

export interface SummaryTileProps {
  label: string;
  value: string;
  subtext?: string;
  fullText?: string;
  className?: string;
  testId?: string;
}

export function SummaryTile({
  label,
  value,
  subtext,
  fullText,
  className = "",
  testId,
}: SummaryTileProps) {
  const tooltip = fullText || (subtext ? `${value} (${subtext})` : value);

  return (
    <div
      data-testid={testId}
      className={`flex flex-col justify-center px-3 py-1 rounded-lg bg-[var(--cw-surface)] border border-[var(--cw-border)] shadow-xs transition-colors min-w-0 ${className}`}
      title={tooltip}
      aria-label={`${label}: ${tooltip}`}
    >
      <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)] truncate">
        {label}
      </span>
      <span className="text-xs sm:text-sm font-semibold text-[var(--cw-text)] truncate leading-tight mt-0.5">
        {value}
      </span>
      {subtext ? (
        <span className="text-[9px] sm:text-[10px] text-[var(--cw-text-muted)] truncate leading-tight mt-0.5">
          {subtext}
        </span>
      ) : (
        <span className="text-[9px] sm:text-[10px] text-transparent select-none leading-tight mt-0.5" aria-hidden="true">
          &nbsp;
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
        value={summary.nextUpTile.value}
        subtext={summary.nextUpTile.subtext}
        fullText={summary.nextUpTile.fullText}
      />
      <SummaryTile
        testId="tile-fees"
        label="Estimated fee"
        value={summary.feesTile.value}
        subtext={summary.feesTile.subtext}
        fullText={summary.feesTile.fullText}
      />
      <SummaryTile
        testId="tile-time"
        label="Total time"
        value={summary.timeTile.value}
        subtext={summary.timeTile.subtext}
        fullText={summary.timeTile.fullText}
      />
      <SummaryTile
        testId="tile-visits"
        label="Office visits"
        value={summary.visitsTile.value}
        subtext={summary.visitsTile.subtext}
        fullText={summary.visitsTile.fullText}
      />
    </div>
  );
}
