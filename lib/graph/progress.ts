import type { ComposedJourney } from "@/lib/contract/compose";
import type { Step } from "@/lib/contract/schema";
import { analyzeJourney } from "@/lib/contract/analyze";
import type { StationState, StationVM } from "./viewModel";

export type StepState = StationState;

export function canMarkDone(
  kind: Step["kind"] | StationVM["kind"]
): boolean {
  return kind !== "milestone";
}

export function deriveStepStates(
  journey: ComposedJourney,
  completed: ReadonlySet<string>
): Map<string, StepState> {
  const states = new Map<string, StepState>();
  const stepMap = new Map(journey.steps.map((s) => [s.id, s]));

  // Map each step to its incoming "requires" prerequisite IDs
  const requiresPrereqsMap = new Map<string, string[]>();
  for (const step of journey.steps) {
    requiresPrereqsMap.set(step.id, []);
  }
  for (const edge of journey.edges) {
    if (edge.kind === "requires") {
      requiresPrereqsMap.get(edge.to)?.push(edge.from);
    }
  }

  const analysis = analyzeJourney(journey);
  const evaluationOrder = analysis.ok
    ? analysis.order
    : journey.steps.map((s) => s.id);

  for (const stepId of evaluationOrder) {
    const step = stepMap.get(stepId);
    if (!step) continue;

    const prereqIds = requiresPrereqsMap.get(stepId) ?? [];

    if (step.kind === "milestone") {
      // Milestones are never in completed.
      // PRD 1.3 §8.8: A milestone is done when every requires prerequisite that isn't may_apply is done
      // AND at least one requires prerequisite is done; otherwise locked.
      const nonMayApplyPrereqs = prereqIds.filter((pId) => {
        const prereqStep = stepMap.get(pId);
        return prereqStep?.applicability !== "may_apply";
      });
      const atLeastOneDone = prereqIds.some((pId) => states.get(pId) === "done");
      const allNonMayApplyDone = nonMayApplyPrereqs.every((pId) => states.get(pId) === "done");
      const isDone = atLeastOneDone && allNonMayApplyDone;
      states.set(stepId, isDone ? "done" : "locked");
    } else {
      // Action steps
      // Milestone IDs in completed are ignored.
      if (completed.has(stepId)) {
        states.set(stepId, "done");
      } else {
        // available if every requires prerequisite is done or may_apply; otherwise locked
        const allPrereqsSatisfied = prereqIds.every((pId) => {
          const prereqStep = stepMap.get(pId);
          if (prereqStep?.applicability === "may_apply") {
            return true;
          }
          return states.get(pId) === "done";
        });
        states.set(stepId, allPrereqsSatisfied ? "available" : "locked");
      }
    }
  }

  return states;
}

export function nextUpStepIds(
  journey: ComposedJourney,
  states: ReadonlyMap<string, StepState>
): string[] {
  const analysis = analyzeJourney(journey);
  const stepMap = new Map(journey.steps.map((s) => [s.id, s]));
  const order = analysis.ok ? analysis.order : journey.steps.map((s) => s.id);

  const nextUp: string[] = [];
  for (const stepId of order) {
    const step = stepMap.get(stepId);
    if (!step) continue;
    if (step.kind === "milestone") continue;
    if (
      step.applicability !== "optional" &&
      step.requirement.kind !== "optional" &&
      states.get(stepId) === "available"
    ) {
      nextUp.push(stepId);
    }
  }

  return nextUp;
}

export interface ProgressCount {
  done: number;
  total: number;
}

/**
 * Computes progress counts covering action steps only (PRD §8.8): excludes milestones.
 */
export function computeProgressCount(
  stationsOrMetro:
    | { stations: readonly Pick<StationVM, "kind" | "applicability" | "state">[] }
    | readonly Pick<StationVM, "kind" | "applicability" | "state">[]
    | null
    | undefined
): ProgressCount {
  if (!stationsOrMetro) return { done: 0, total: 0 };
  const stations = "stations" in stationsOrMetro ? stationsOrMetro.stations : stationsOrMetro;
  const actionStations = stations.filter(
    (s) => s.kind !== "milestone" && s.applicability !== "optional"
  );
  const done = actionStations.filter((s) => s.state === "done").length;
  return {
    done,
    total: actionStations.length,
  };
}
