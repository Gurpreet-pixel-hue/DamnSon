import type { CivicTaskGraph } from "./schema";
import { isOfficialUrl } from "./officialSources";

export type GraphIssueCode =
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_EDGE_ID"
  | "UNKNOWN_NODE_REF"
  | "SELF_LOOP"
  | "DUPLICATE_EDGE"
  | "CYCLE"
  | "INVERTED_RANGE"
  | "VERIFIED_WITHOUT_OFFICIAL_SOURCE"
  | "NO_OFFICIAL_SOURCE"
  | "UNOFFICIAL_SOURCE";

export interface GraphIssue {
  severity: "error" | "warning";
  code: GraphIssueCode;
  message: string;
  nodeIds?: string[];
  edgeIds?: string[];
}

export interface GraphAnalysis {
  ok: boolean;
  order: string[];
  layers: string[][];
  issues: GraphIssue[];
}

export function analyzeGraph(graph: CivicTaskGraph): GraphAnalysis {
  const issues: GraphIssue[] = [];
  const nodeMap = new Map<string, CivicTaskGraph["nodes"][number]>();
  const nodeOrderMap = new Map<string, number>();

  graph.nodes.forEach((n, idx) => {
    if (nodeMap.has(n.id)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_NODE_ID",
        message: `Duplicate step id: ${n.id}`,
        nodeIds: [n.id],
      });
    } else {
      nodeMap.set(n.id, n);
      nodeOrderMap.set(n.id, idx);
    }
  });

  const edgeMap = new Set<string>();
  const edgePairs = new Set<string>();

  for (const e of graph.edges) {
    if (edgeMap.has(e.id)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_EDGE_ID",
        message: `Duplicate edge id: ${e.id}`,
        edgeIds: [e.id],
      });
    } else {
      edgeMap.add(e.id);
    }

    const fromExists = nodeMap.has(e.from);
    const toExists = nodeMap.has(e.to);

    if (!fromExists || !toExists) {
      issues.push({
        severity: "error",
        code: "UNKNOWN_NODE_REF",
        message: `Edge ${e.id} references unknown node: ${!fromExists ? e.from : e.to}`,
        edgeIds: [e.id],
      });
      continue;
    }

    if (e.from === e.to) {
      issues.push({
        severity: "error",
        code: "SELF_LOOP",
        message: `Self-loop detected on node: ${e.from}`,
        nodeIds: [e.from],
        edgeIds: [e.id],
      });
    }

    const pairKey = `${e.from}->${e.to}`;
    if (edgePairs.has(pairKey)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_EDGE",
        message: `Duplicate edge from ${e.from} to ${e.to}`,
        edgeIds: [e.id],
      });
    } else {
      edgePairs.add(pairKey);
    }
  }

  // Node-level field and source validations
  for (const n of graph.nodes) {
    if (n.fee.kind === "range" && n.fee.minINR > n.fee.maxINR) {
      issues.push({
        severity: "error",
        code: "INVERTED_RANGE",
        message: `Fee minINR (${n.fee.minINR}) is greater than maxINR (${n.fee.maxINR}) for step: ${n.id}`,
        nodeIds: [n.id],
      });
    }

    if (
      n.processingTime.kind === "estimate" &&
      n.processingTime.minDays > n.processingTime.maxDays
    ) {
      issues.push({
        severity: "error",
        code: "INVERTED_RANGE",
        message: `Processing time minDays (${n.processingTime.minDays}) is greater than maxDays (${n.processingTime.maxDays}) for step: ${n.id}`,
        nodeIds: [n.id],
      });
    }

    const hasOfficial = n.sources.some((s) => isOfficialUrl(s.url));

    if (n.review.status === "verified" && !hasOfficial) {
      issues.push({
        severity: "error",
        code: "VERIFIED_WITHOUT_OFFICIAL_SOURCE",
        message: `Step ${n.id} is marked verified but has no official source`,
        nodeIds: [n.id],
      });
    }

    if (!hasOfficial) {
      issues.push({
        severity: "warning",
        code: "NO_OFFICIAL_SOURCE",
        message: `Step ${n.id} has no official source`,
        nodeIds: [n.id],
      });
    }

    for (const s of n.sources) {
      if (!isOfficialUrl(s.url)) {
        issues.push({
          severity: "warning",
          code: "UNOFFICIAL_SOURCE",
          message: `Step ${n.id} has unofficial source: ${s.url}`,
          nodeIds: [n.id],
        });
      }
    }
  }

  // Cycle detection with Tarjan's strongly connected components algorithm
  const validEdges = graph.edges.filter(
    (e) => nodeMap.has(e.from) && nodeMap.has(e.to) && e.from !== e.to
  );
  const adj = new Map<string, string[]>();
  for (const [id] of nodeMap) {
    adj.set(id, []);
  }
  for (const e of validEdges) {
    adj.get(e.from)?.push(e.to);
  }

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycleNodes = new Set<string>();

  function strongconnect(v: string) {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        const wLow = lowlink.get(w);
        const vLow = lowlink.get(v);
        if (wLow !== undefined && vLow !== undefined) {
          lowlink.set(v, Math.min(vLow, wLow));
        }
      } else if (onStack.has(w)) {
        const wIdx = indices.get(w);
        const vLow = lowlink.get(v);
        if (wIdx !== undefined && vLow !== undefined) {
          lowlink.set(v, Math.min(vLow, wIdx));
        }
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w !== undefined) {
          onStack.delete(w);
          scc.push(w);
        }
      } while (w !== undefined && w !== v);

      if (scc.length > 1) {
        for (const node of scc) {
          cycleNodes.add(node);
        }
      }
    }
  }

  for (const [id] of nodeMap) {
    if (!indices.has(id)) {
      strongconnect(id);
    }
  }

  if (cycleNodes.size > 0) {
    const sortedCycleNodes = Array.from(cycleNodes).sort(
      (a, b) => (nodeOrderMap.get(a) ?? 0) - (nodeOrderMap.get(b) ?? 0)
    );
    issues.push({
      severity: "error",
      code: "CYCLE",
      message: `Cycle detected involving steps: ${sortedCycleNodes.join(", ")}`,
      nodeIds: sortedCycleNodes,
    });
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  if (hasErrors) {
    return { ok: false, order: [], layers: [], issues };
  }

  // Kahn's algorithm for deterministic topological sort
  const inDegree = new Map<string, number>();
  for (const [id] of nodeMap) {
    inDegree.set(id, 0);
  }
  for (const e of validEdges) {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const available: string[] = [];
  for (const [id] of nodeMap) {
    if (inDegree.get(id) === 0) {
      available.push(id);
    }
  }
  available.sort(
    (a, b) => (nodeOrderMap.get(a) ?? 0) - (nodeOrderMap.get(b) ?? 0)
  );

  const order: string[] = [];
  while (available.length > 0) {
    const u = available.shift();
    if (u === undefined) break;
    order.push(u);

    for (const v of adj.get(u) ?? []) {
      const d = (inDegree.get(v) ?? 0) - 1;
      inDegree.set(v, d);
      if (d === 0) {
        available.push(v);
        available.sort(
          (a, b) => (nodeOrderMap.get(a) ?? 0) - (nodeOrderMap.get(b) ?? 0)
        );
      }
    }
  }

  // Layers computation
  const layerMap = new Map<string, number>();
  for (const id of order) {
    const prereqEdges = validEdges.filter((e) => e.to === id);
    if (prereqEdges.length === 0) {
      layerMap.set(id, 0);
    } else {
      const maxPrereqLayer = Math.max(
        ...prereqEdges.map((e) => layerMap.get(e.from) ?? 0)
      );
      layerMap.set(id, maxPrereqLayer + 1);
    }
  }

  const maxLayer = Math.max(-1, ...Array.from(layerMap.values()));
  const layers: string[][] = [];
  for (let l = 0; l <= maxLayer; l++) {
    layers.push([]);
  }
  for (const id of order) {
    const l = layerMap.get(id) ?? 0;
    const bucket = layers[l];
    if (bucket) {
      bucket.push(id);
    }
  }

  return { ok: true, order, layers, issues };
}
