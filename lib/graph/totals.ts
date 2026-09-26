import type { ResolvedPath } from "./resolvePath";
import { analyzeGraph } from "./analyzeGraph";

export interface FeeSummary {
  minINR: number;
  maxINR: number;
  unconfirmedCount: number;
  undecidedCount: number;
}

export interface TimeSummary {
  minDays: number;
  maxDays: number;
  unknownCount: number;
  criticalStepIds: string[];
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
  path: ResolvedPath,
  completed: ReadonlySet<string>
): FeeSummary {
  let minINR = 0;
  let maxINR = 0;
  let unconfirmedCount = 0;
  let undecidedCount = 0;

  const undecidedSet = new Set(path.undecidedStepIds);

  for (const node of path.graph.nodes) {
    // Both summaries skip optional steps and completed steps
    if (node.requirement.kind === "optional" || completed.has(node.id)) {
      continue;
    }

    const isUndecided = undecidedSet.has(node.id);
    if (isUndecided) {
      undecidedCount++;
    }

    const fee = node.fee;
    switch (fee.kind) {
      case "free":
        break;
      case "fixed":
        if (isUndecided) {
          maxINR += fee.amountINR;
        } else {
          minINR += fee.amountINR;
          maxINR += fee.amountINR;
        }
        break;
      case "range":
        if (isUndecided) {
          maxINR += fee.maxINR;
        } else {
          minINR += fee.minINR;
          maxINR += fee.maxINR;
        }
        break;
      case "variable":
      case "unknown":
        unconfirmedCount++;
        break;
    }
  }

  return {
    minINR,
    maxINR,
    unconfirmedCount,
    undecidedCount,
  };
}

export function summarizeTime(
  path: ResolvedPath,
  completed: ReadonlySet<string>
): TimeSummary {
  const { graph } = path;
  if (graph.nodes.length === 0) {
    return {
      minDays: 0,
      maxDays: 0,
      unknownCount: 0,
      criticalStepIds: [],
    };
  }

  const analysis = analyzeGraph(graph);
  const nodeOrderMap = new Map<string, number>(
    graph.nodes.map((n, idx) => [n.id, idx])
  );
  const undecidedSet = new Set(path.undecidedStepIds);

  // Map incoming prerequisite IDs
  const prereqsMap = new Map<string, string[]>();
  for (const node of graph.nodes) {
    prereqsMap.set(node.id, []);
  }
  for (const edge of graph.edges) {
    prereqsMap.get(edge.to)?.push(edge.from);
  }

  let unknownCount = 0;

  // Step durations: remaining [dMin, dMax] and full [fullDMin, fullDMax]
  const dMinMap = new Map<string, number>();
  const dMaxMap = new Map<string, number>();
  const fullDMaxMap = new Map<string, number>();

  for (const node of graph.nodes) {
    const isCompleted = completed.has(node.id);
    const isOptional = node.requirement.kind === "optional";
    const isUndecided = undecidedSet.has(node.id);
    const pt = node.processingTime;

    let baseMin = 0;
    let baseMax = 0;

    if (pt.kind === "estimate") {
      baseMin = toCalendarDays(pt.minDays, pt.dayType);
      baseMax = toCalendarDays(pt.maxDays, pt.dayType);
    } else {
      if (!isCompleted && !isOptional) {
        unknownCount++;
      }
    }

    fullDMaxMap.set(node.id, isOptional ? 0 : baseMax);

    if (isCompleted || isOptional) {
      dMinMap.set(node.id, 0);
      dMaxMap.set(node.id, 0);
    } else if (pt.kind === "unknown") {
      dMinMap.set(node.id, 0);
      dMaxMap.set(node.id, 0);
    } else {
      dMinMap.set(node.id, isUndecided ? 0 : baseMin);
      dMaxMap.set(node.id, baseMax);
    }
  }

  // Longest path in topological order
  const finishMinMap = new Map<string, number>();
  const finishMaxMap = new Map<string, number>();
  const fullFinishMaxMap = new Map<string, number>();
  const bestPrereqMap = new Map<string, string | null>();

  for (const id of analysis.order) {
    const prereqs = prereqsMap.get(id) ?? [];
    const dMin = dMinMap.get(id) ?? 0;
    const dMax = dMaxMap.get(id) ?? 0;
    const fullDMax = fullDMaxMap.get(id) ?? 0;

    if (prereqs.length === 0) {
      finishMinMap.set(id, dMin);
      finishMaxMap.set(id, dMax);
      fullFinishMaxMap.set(id, fullDMax);
      bestPrereqMap.set(id, null);
    } else {
      let maxPrereqMin = 0;
      let maxPrereqMax = 0;
      let maxPrereqFullMax = 0;

      for (const p of prereqs) {
        const pMin = finishMinMap.get(p) ?? 0;
        const pMax = finishMaxMap.get(p) ?? 0;
        const pFullMax = fullFinishMaxMap.get(p) ?? 0;
        if (pMin > maxPrereqMin) maxPrereqMin = pMin;
        if (pMax > maxPrereqMax) maxPrereqMax = pMax;
        if (pFullMax > maxPrereqFullMax) maxPrereqFullMax = pFullMax;
      }

      finishMinMap.set(id, maxPrereqMin + dMin);
      finishMaxMap.set(id, maxPrereqMax + dMax);
      fullFinishMaxMap.set(id, maxPrereqFullMax + fullDMax);

      // Best prerequisite for critical path backtracking:
      // Primary: largest finishMax(p)
      // Secondary: largest fullFinishMax(p) (preserves critical chain through completed steps)
      // Tertiary: earliest in graph.nodes order
      let bestP: string | null = null;
      for (const p of prereqs) {
        if (bestP === null) {
          bestP = p;
        } else {
          const pMax = finishMaxMap.get(p) ?? 0;
          const bestMax = finishMaxMap.get(bestP) ?? 0;
          if (pMax > bestMax) {
            bestP = p;
          } else if (pMax === bestMax) {
            const pFullMax = fullFinishMaxMap.get(p) ?? 0;
            const bestFullMax = fullFinishMaxMap.get(bestP) ?? 0;
            if (pFullMax > bestFullMax) {
              bestP = p;
            } else if (pFullMax === bestFullMax) {
              const pOrder = nodeOrderMap.get(p) ?? 0;
              const bestOrder = nodeOrderMap.get(bestP) ?? 0;
              if (pOrder < bestOrder) {
                bestP = p;
              }
            }
          }
        }
      }
      bestPrereqMap.set(id, bestP);
    }
  }

  // Maximum finish values across all nodes
  let totalMinDays = 0;
  let totalMaxDays = 0;
  for (const id of analysis.order) {
    const fMin = finishMinMap.get(id) ?? 0;
    const fMax = finishMaxMap.get(id) ?? 0;
    if (fMin > totalMinDays) totalMinDays = fMin;
    if (fMax > totalMaxDays) totalMaxDays = fMax;
  }

  // Find step with largest finishMax to backtrack critical path
  let endStep: string | null = null;
  for (const id of analysis.order) {
    if (endStep === null) {
      endStep = id;
    } else {
      const fMax = finishMaxMap.get(id) ?? 0;
      const endMax = finishMaxMap.get(endStep) ?? 0;
      if (fMax > endMax) {
        endStep = id;
      } else if (fMax === endMax) {
        const fFullMax = fullFinishMaxMap.get(id) ?? 0;
        const endFullMax = fullFinishMaxMap.get(endStep) ?? 0;
        if (fFullMax > endFullMax) {
          endStep = id;
        } else if (fFullMax === endFullMax) {
          const idOrder = nodeOrderMap.get(id) ?? 0;
          const endOrder = nodeOrderMap.get(endStep) ?? 0;
          if (idOrder < endOrder) {
            endStep = id;
          }
        }
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

  return {
    minDays: totalMinDays,
    maxDays: totalMaxDays,
    unknownCount,
    criticalStepIds,
  };
}
