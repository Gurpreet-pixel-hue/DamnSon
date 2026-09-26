import type { CivicTaskGraph, Edge } from "./schema";

export type Answers = Readonly<Record<string, boolean>>;

export interface ResolvedPath {
  graph: CivicTaskGraph;
  excludedStepIds: string[];
  undecidedStepIds: string[];
}

export function resolvePath(
  graph: CivicTaskGraph,
  answers: Answers
): ResolvedPath {
  const excludedStepIds: string[] = [];
  const undecidedStepIds: string[] = [];
  const excludedSet = new Set<string>();

  for (const node of graph.nodes) {
    if (node.requirement.kind === "conditional") {
      const { questionId, answer: expectedAnswer } = node.requirement.appliesWhen;
      const actualAnswer = answers[questionId];
      if (actualAnswer === undefined) {
        undecidedStepIds.push(node.id);
      } else if (actualAnswer !== expectedAnswer) {
        excludedStepIds.push(node.id);
        excludedSet.add(node.id);
      }
    }
  }

  // Surviving nodes preserve order
  const survivingNodes = graph.nodes.filter((n) => !excludedSet.has(n.id));

  // Process edge bridging step-by-step for excluded nodes in nodes order
  let currentEdges: Edge[] = graph.edges.map((e) => ({ ...e }));

  for (const excludedId of excludedStepIds) {
    // Find prerequisites and dependents of this excluded node
    const prereqs = currentEdges
      .filter((e) => e.to === excludedId)
      .map((e) => e.from);
    const dependents = currentEdges
      .filter((e) => e.from === excludedId)
      .map((e) => e.to);

    // Surviving edges without this excluded node
    const remainingEdges = currentEdges.filter(
      (e) => e.from !== excludedId && e.to !== excludedId
    );

    const existingPairs = new Set(
      remainingEdges.map((e) => `${e.from}->${e.to}`)
    );
    const bridgeEdges: Edge[] = [];

    for (const from of prereqs) {
      for (const to of dependents) {
        if (from === to) continue;
        const pairKey = `${from}->${to}`;
        if (!existingPairs.has(pairKey)) {
          existingPairs.add(pairKey);
          bridgeEdges.push({
            id: `bridge-${from}-${to}`,
            from,
            to,
          });
        }
      }
    }

    currentEdges = [...remainingEdges, ...bridgeEdges];
  }

  const resolvedGraph: CivicTaskGraph = {
    ...graph,
    nodes: survivingNodes,
    edges: currentEdges,
  };

  return {
    graph: resolvedGraph,
    excludedStepIds,
    undecidedStepIds,
  };
}
