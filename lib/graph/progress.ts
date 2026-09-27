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
      // A milestone is done when every requires prerequisite that isn't may_apply is done; otherwise locked.
      const nonMayApplyPrereqs = prereqIds.filter((pId) => {
        const prereqStep = stepMap.get(pId);
        return prereqStep?.applicability !== "may_apply";
      });
      const allDone = nonMayApplyPrereqs.every((pId) => states.get(pId) === "done");
      states.set(stepId, allDone ? "done" : "locked");
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
