import type { ComposedJourney, ComposedStep } from "@/lib/contract/compose";
import type { MetroVM } from "./viewModel";
import { getStages, currentStage } from "./stages";

/** One kind of station that appeared or disappeared (repeated stations such as KYC ×2 are grouped by title). */
export interface StationChange {
  title: string;
  count: number;
  stepIds: string[];
  /** Why it was removed, from the journey's "not needed" list (absent for fewer repeats). */
  reason?: string;
}

export interface JourneyDiff {
  added: StationChange[];
  removed: StationChange[];
  /** Stations that were already on the map as "may apply" or "optional" and now apply. */
  confirmed: StationChange[];
}

function group(
  steps: ComposedStep[],
  reasonFor?: (step: ComposedStep) => string | undefined
): StationChange[] {
  const byTitle = new Map<string, StationChange>();
  for (const step of steps) {
    const existing = byTitle.get(step.title);
    if (existing) {
      existing.count += 1;
      existing.stepIds.push(step.id);
      continue;
    }
    const reason = reasonFor?.(step);
    byTitle.set(step.title, {
      title: step.title,
      count: 1,
      stepIds: [step.id],
      ...(reason ? { reason } : {}),
    });
  }
  return [...byTitle.values()];
}

/**
 * Stations added and removed when a journey is recomposed after a fact changes (PRD §5 F3, C4).
 * Pure; derived, never stored.
 */
export function diffJourneys(
  prev: ComposedJourney,
  next: ComposedJourney
): JourneyDiff {
  const prevIds = new Set(prev.steps.map((s) => s.id));
  const nextIds = new Set(next.steps.map((s) => s.id));

  const reasonFor = (step: ComposedStep): string | undefined => {
    for (const item of next.excluded) {
      if (item.kind === "step" && item.stepId === step.id) return item.reason;
      if (item.kind === "module" && item.moduleId === step.moduleId) return item.reason;
    }
    return undefined;
  };

  const prevApplicability = new Map(
    prev.steps.map((s) => [s.id, s.applicability])
  );

  return {
    added: group(next.steps.filter((s) => !prevIds.has(s.id))),
    removed: group(
      prev.steps.filter((s) => !nextIds.has(s.id)),
      reasonFor
    ),
    confirmed: group(
      next.steps.filter((s) => {
        const before = prevApplicability.get(s.id);
        return (
          before !== undefined &&
          before !== "applies" &&
          s.applicability === "applies"
        );
      })
    ),
  };
}

/** Short human summary, e.g. "+1 station, −1 station, 2 now apply". Empty string when nothing changed. */
export function formatDiff(diff: JourneyDiff): string {
  const total = (list: StationChange[]) =>
    list.reduce((n, c) => n + c.count, 0);
  const add = total(diff.added);
  const remove = total(diff.removed);
  const confirm = total(diff.confirmed);
  const parts: string[] = [];
  if (add > 0) parts.push(`+${add} ${add === 1 ? "station" : "stations"}`);
  if (remove > 0) parts.push(`−${remove} ${remove === 1 ? "station" : "stations"}`);
  if (confirm > 0) parts.push(`${confirm} now ${confirm === 1 ? "applies" : "apply"}`);
  return parts.join(", ");
}

/**
 * Clamps or restores focusStage if the focused stage is gone or empty after a recompose (Amendment 4).
 */
export function clampFocusStage(
  currentFocus: number,
  nextMetro: MetroVM
): number {
  const stages = getStages(nextMetro);
  const totalStages = stages.length;

  if (totalStages === 0) return 1;
  if (currentFocus < 1 || currentFocus > totalStages) {
    return currentStage(nextMetro);
  }
  const stage = stages[currentFocus - 1];
  if (!stage || stage.stations.length === 0) {
    return currentStage(nextMetro);
  }
  return currentFocus;
}
