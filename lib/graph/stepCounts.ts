import type { ComposedJourney, ComposedStep } from "@/lib/contract/compose";

type ActionStep = Exclude<ComposedStep, { kind: "milestone" }>;

/**
 * One definition of "how many steps" for every surface that shows it (PRD §8.8: totals are derived).
 *
 * - `total` counts action steps only. Milestones ("Company incorporated") are outcomes, not things to
 *   do, so they are never counted, matching the template summaries (lib/server/journeys/summary.ts).
 * - `mayApply` and `optional` are subsets of `total`, shown separately where a surface has room.
 * - `verified` counts action steps whose review status is "verified".
 */
export interface StepCounts {
  total: number;
  applies: number;
  mayApply: number;
  optional: number;
  verified: number;
}

export function isActionStep(step: ComposedStep): step is ActionStep {
  return step.kind !== "milestone";
}

export function deriveStepCounts(journey: ComposedJourney): StepCounts {
  const counts: StepCounts = { total: 0, applies: 0, mayApply: 0, optional: 0, verified: 0 };
  for (const step of journey.steps) {
    if (!isActionStep(step)) continue;
    counts.total += 1;
    if (step.applicability === "may_apply") counts.mayApply += 1;
    else if (step.applicability === "optional") counts.optional += 1;
    else counts.applies += 1;
    if (step.review.status === "verified") counts.verified += 1;
  }
  return counts;
}
