import type { ComposedJourney, ComposedStep } from "@/lib/contract/compose";
import { analyzeJourney } from "@/lib/contract/analyze";
import { evaluateRule } from "@/lib/contract/rules";

export interface FeeSummary {
  minINR: number;
  maxINR: number;
  unconfirmedCount: number;
  mayApplyCount: number;
  annualMinINR: number;
  annualMaxINR: number;
  annualUnconfirmedCount: number;
  conditionalMaxINR: number;
}

export interface TimeSummary {
  minDays: number;
  maxDays: number;
  openEnded: boolean;
  unknownCount: number;
  criticalStepIds: string[];
  relativeTo: string | null;
  relative?: {
    minDays: number;
    maxDays: number;
    openEnded: boolean;
  };
}

export function toCalendarDays(
  days: number,
  dayType: "working" | "calendar"
): number {
  if (dayType === "working") {
    return Math.ceil((days * 7) / 5);
  }
  return days;
}

export function summarizeFees(
  journey: ComposedJourney,
  completed: ReadonlySet<string>
): FeeSummary {
  let minINR = 0;
  let maxINR = 0;
  let unconfirmedCount = 0;
  let mayApplyCount = 0;
  let annualMinINR = 0;
  let annualMaxINR = 0;
  let annualUnconfirmedCount = 0;
  let conditionalMaxINR = 0;

  for (const step of journey.steps) {
    // Totals skip done, optional and milestone steps
    if (step.kind === "milestone") continue;
    if (step.applicability === "optional" || step.requirement.kind === "optional") continue;
    if (completed.has(step.id)) continue;

    const isMayApply = step.applicability === "may_apply";
    if (isMayApply) {
      mayApplyCount++;
    }

    const fee = step.fee;
    const isAnnual = "recurrence" in fee && fee.recurrence === "annual";

    switch (fee.kind) {
      case "free":
        break;
      case "fixed":
        if (isAnnual) {
          if (isMayApply) {
            annualMaxINR += fee.amountINR;
          } else {
            annualMinINR += fee.amountINR;
            annualMaxINR += fee.amountINR;
          }
        } else {
          if (isMayApply) {
            maxINR += fee.amountINR;
            conditionalMaxINR += fee.amountINR;
          } else {
            minINR += fee.amountINR;
            maxINR += fee.amountINR;
          }
        }
        break;
      case "range":
        if (isAnnual) {
          if (isMayApply) {
            annualMaxINR += fee.maxINR;
          } else {
            annualMinINR += fee.minINR;
            annualMaxINR += fee.maxINR;
          }
        } else {
          if (isMayApply) {
            maxINR += fee.maxINR;
            conditionalMaxINR += fee.maxINR;
          } else {
            minINR += fee.minINR;
            maxINR += fee.maxINR;
          }
        }
        break;
      case "variable":
        if (isAnnual) {
          annualUnconfirmedCount++;
        } else {
          unconfirmedCount++;
        }
        break;
      case "unknown":
        unconfirmedCount++;
        break;
    }
  }

  return {
    minINR,
    maxINR,
    unconfirmedCount,
    mayApplyCount,
    annualMinINR,
    annualMaxINR,
    annualUnconfirmedCount,
    conditionalMaxINR,
  };
}

export function summarizeTime(
  journey: ComposedJourney,
  completed: ReadonlySet<string>
): TimeSummary {
  if (journey.steps.length === 0) {
    return {
      minDays: 0,
      maxDays: 0,
      openEnded: false,
      unknownCount: 0,
      criticalStepIds: [],
      relativeTo: null,
    };
  }

  const analysis = analyzeJourney(journey);
  const evaluationOrder = analysis.ok
    ? analysis.order
    : journey.steps.map((s) => s.id);

  const stepMap = new Map<string, ComposedStep>(
    journey.steps.map((s) => [s.id, s])
  );
  const orderIndexMap = new Map<string, number>(
    evaluationOrder.map((id, idx) => [id, idx])
  );

  // Map incoming "requires" prerequisites
  const requiresPrereqsMap = new Map<string, string[]>();
  for (const step of journey.steps) {
    requiresPrereqsMap.set(step.id, []);
  }
  for (const edge of journey.edges) {
    if (edge.kind === "requires") {
      requiresPrereqsMap.get(edge.to)?.push(edge.from);
    }
  }

  let unknownCount = 0;

  // Identify path steps: optional steps are left out entirely.
  // Done steps and milestones stay on the path with 0 duration.
  const pathStepIds = new Set<string>();
  const dMinMap = new Map<string, number>();
  const dMaxMap = new Map<string, number>();
  const openEndedMap = new Map<string, boolean>();

  for (const step of journey.steps) {
    const isOptional =
      step.applicability === "optional" ||
      step.requirement.kind === "optional";
    if (isOptional) continue;

    pathStepIds.add(step.id);

    const isDone = completed.has(step.id);
    const isMilestone = step.kind === "milestone";

    if (isDone || isMilestone) {
      dMinMap.set(step.id, 0);
      dMaxMap.set(step.id, 0);
      openEndedMap.set(step.id, false);
      continue;
    }

    // Not-done action step
    let stepMin = 0;
    let stepMax = 0;
    let stepOpenEnded = false;

    const sla = step.timeline.officialSla;
    if (sla.kind === "sla") {
      stepMin = toCalendarDays(sla.duration.minDays, sla.duration.dayType);
      stepMax = toCalendarDays(sla.duration.maxDays, sla.duration.dayType);
    } else if (sla.kind === "no_fixed_sla") {
      stepOpenEnded = true;
    } else if (sla.kind === "unknown") {
      unknownCount++;
    }

    for (const c of step.timeline.conditional) {
      const res = c.rule ? evaluateRule(c.rule, journey.facts) : "unknown";
      if (res === "false") continue;

      if (c.duration.kind === "open_ended") {
        stepOpenEnded = true;
      } else if (c.duration.kind === "range") {
        const cMin = toCalendarDays(c.duration.minDays, c.duration.dayType);
        const cMax = toCalendarDays(c.duration.maxDays, c.duration.dayType);
        stepMax += cMax;
        if (res === "true") {
          stepMin += cMin;
        }
      }
    }

    if (step.applicability === "may_apply") {
      stepMin = 0;
    }

    dMinMap.set(step.id, stepMin);
    dMaxMap.set(step.id, stepMax);
    openEndedMap.set(step.id, stepOpenEnded);
  }

  // Walk path steps in evaluation order
  const finishMinMap = new Map<string, number>();
  const finishMaxMap = new Map<string, number>();
  const finishOpenEndedMap = new Map<string, boolean>();
  const bestPrereqMap = new Map<string, string | null>();

  for (const stepId of evaluationOrder) {
    if (!pathStepIds.has(stepId)) continue;

    const allPrereqs = requiresPrereqsMap.get(stepId) ?? [];
    const pathPrereqs = allPrereqs.filter((p) => pathStepIds.has(p));

    const dMin = dMinMap.get(stepId) ?? 0;
    const dMax = dMaxMap.get(stepId) ?? 0;
    const stepOpen = openEndedMap.get(stepId) ?? false;

    if (pathPrereqs.length === 0) {
      finishMinMap.set(stepId, dMin);
      finishMaxMap.set(stepId, dMax);
      finishOpenEndedMap.set(stepId, stepOpen);
      bestPrereqMap.set(stepId, null);
    } else {
      let maxPrereqMin = 0;
      let maxPrereqMax = 0;
      let anyPrereqOpen = false;

      for (const p of pathPrereqs) {
        const pMin = finishMinMap.get(p) ?? 0;
        const pMax = finishMaxMap.get(p) ?? 0;
        const pOpen = finishOpenEndedMap.get(p) ?? false;

        if (pMin > maxPrereqMin) maxPrereqMin = pMin;
        if (pMax > maxPrereqMax) maxPrereqMax = pMax;
        if (pOpen) anyPrereqOpen = true;
      }

      finishMinMap.set(stepId, maxPrereqMin + dMin);
      finishMaxMap.set(stepId, maxPrereqMax + dMax);
      finishOpenEndedMap.set(stepId, anyPrereqOpen || stepOpen);

      // Best prerequisite for critical path backtracking:
      // Largest finishMax, ties go to earlier step in analyzeJourney order
      let bestP: string | null = null;
      for (const p of pathPrereqs) {
        if (bestP === null) {
          bestP = p;
        } else {
          const pMax = finishMaxMap.get(p) ?? 0;
          const bestMax = finishMaxMap.get(bestP) ?? 0;
          if (pMax > bestMax) {
            bestP = p;
          } else if (pMax === bestMax) {
            const pOrder = orderIndexMap.get(p) ?? 0;
            const bestOrder = orderIndexMap.get(bestP) ?? 0;
            if (pOrder < bestOrder) {
              bestP = p;
            }
          }
        }
      }
      bestPrereqMap.set(stepId, bestP);
    }
  }

  // Maximum finish values across all path steps
  let totalMinDays = 0;
  let totalMaxDays = 0;
  let totalOpenEnded = false;

  for (const stepId of pathStepIds) {
    const fMin = finishMinMap.get(stepId) ?? 0;
    const fMax = finishMaxMap.get(stepId) ?? 0;
    const fOpen = finishOpenEndedMap.get(stepId) ?? false;

    if (fMin > totalMinDays) totalMinDays = fMin;
    if (fMax > totalMaxDays) totalMaxDays = fMax;
    if (fOpen) totalOpenEnded = true;
  }

  // Find step with largest finishMax to backtrack critical path (ties go to earlier step)
  let endStep: string | null = null;
  for (const stepId of evaluationOrder) {
    if (!pathStepIds.has(stepId)) continue;
    if (endStep === null) {
      endStep = stepId;
    } else {
      const fMax = finishMaxMap.get(stepId) ?? 0;
      const endMax = finishMaxMap.get(endStep) ?? 0;
      if (fMax > endMax) {
        endStep = stepId;
      }
    }
  }

  const criticalStepIds: string[] = [];
  let curr = endStep;
  while (curr !== null) {
    criticalStepIds.push(curr);
    curr = bestPrereqMap.get(curr) ?? null;
  }
  criticalStepIds.reverse();

  // relativeTo: the last not-done no_fixed_sla step on the critical path, else null
  let relativeTo: string | null = null;
  for (let i = criticalStepIds.length - 1; i >= 0; i--) {
    const stepId = criticalStepIds[i];
    if (!stepId) continue;
    if (completed.has(stepId)) continue;
    const step = stepMap.get(stepId);
    if (!step || step.kind === "milestone") continue;
    if (step.timeline.officialSla.kind === "no_fixed_sla") {
      relativeTo = stepId;
      break;
    }
  }

  let relative: TimeSummary["relative"] | undefined;
  if (relativeTo !== null) {
    // Collect relativeTo and all its requires ancestors
    const ancestors = new Set<string>();
    const stack = [relativeTo];
    while (stack.length > 0) {
      const currId = stack.pop();
      if (!currId) continue;
      const prereqs = requiresPrereqsMap.get(currId) ?? [];
      for (const p of prereqs) {
        if (!ancestors.has(p)) {
          ancestors.add(p);
          stack.push(p);
        }
      }
    }

    const relCompleted = new Set([...completed, relativeTo, ...ancestors]);
    const relSummary = summarizeTime(journey, relCompleted);
    relative = {
      minDays: relSummary.minDays,
      maxDays: relSummary.maxDays,
      openEnded: relSummary.openEnded,
    };
  }

  return {
    minDays: totalMinDays,
    maxDays: totalMaxDays,
    openEnded: totalOpenEnded,
    unknownCount,
    criticalStepIds,
    relativeTo,
    ...(relative ? { relative } : {}),
  };
}
