import type { CivicTaskGraph } from "./schema";
import { analyzeGraph } from "./analyzeGraph";

export type StepState = "done" | "available" | "locked";

export function deriveStepStates(
  graph: CivicTaskGraph,
  completed: ReadonlySet<string>
): Map<string, StepState> {
  const states = new Map<string, StepState>();

  // Map each step to its incoming prerequisite IDs
  const prereqMap = new Map<string, string[]>();
  for (const node of graph.nodes) {
    prereqMap.set(node.id, []);
  }
  for (const edge of graph.edges) {
    prereqMap.get(edge.to)?.push(edge.from);
  }

  for (const node of graph.nodes) {
    if (completed.has(node.id)) {
      states.set(node.id, "done");
    } else {
      const prereqs = prereqMap.get(node.id) ?? [];
      const allPrereqsDone = prereqs.every((p) => completed.has(p));
      states.set(node.id, allPrereqsDone ? "available" : "locked");
    }
  }

  return states;
}

export function nextUpStepIds(
  graph: CivicTaskGraph,
  states: ReadonlyMap<string, StepState>
): string[] {
  const analysis = analyzeGraph(graph);
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  const nextUp: string[] = [];
  for (const stepId of analysis.order) {
    const node = nodeMap.get(stepId);
    if (!node) continue;
    if (
      states.get(stepId) === "available" &&
      node.requirement.kind !== "optional"
    ) {
      nextUp.push(stepId);
    }
  }

  return nextUp;
}
