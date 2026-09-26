import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolvePath } from "./resolvePath";
import { analyzeGraph } from "./analyzeGraph";
import { civicTaskGraphSchema, type CivicTaskGraph } from "./schema";

function loadExample(): CivicTaskGraph {
  const filePath = path.resolve(
    process.cwd(),
    "data/fixtures/valid/example-graph.json"
  );
  return civicTaskGraphSchema.parse(
    JSON.parse(fs.readFileSync(filePath, "utf8"))
  );
}

describe("resolvePath", () => {
  it("resolves {} with fire-clearance undecided and 4 nodes", () => {
    const graph = loadExample();
    const resolved = resolvePath(graph, {});

    expect(resolved.undecidedStepIds).toEqual(["fire-clearance"]);
    expect(resolved.excludedStepIds).toEqual([]);
    expect(resolved.graph.nodes.length).toBe(4);
  });

  it('resolves {"large-premises": false} with fire-clearance excluded and bridged edges', () => {
    const graph = loadExample();
    const resolved = resolvePath(graph, { "large-premises": false });

    expect(resolved.excludedStepIds).toEqual(["fire-clearance"]);
    expect(resolved.undecidedStepIds).toEqual([]);
    expect(resolved.graph.nodes.map((n) => n.id)).toEqual([
      "apply-online",
      "site-inspection",
      "licence-issued",
    ]);

    const edgeRepresentations = resolved.graph.edges.map(
      (e) => `${e.id}:${e.from}>${e.to}`
    );
    expect(edgeRepresentations).toEqual([
      "e-apply-inspect:apply-online>site-inspection",
      "e-inspect-issue:site-inspection>licence-issued",
      "bridge-apply-online-licence-issued:apply-online>licence-issued",
    ]);

    const analysis = analyzeGraph(resolved.graph);
    expect(analysis.ok).toBe(true);
    expect(analysis.layers).toEqual([
      ["apply-online"],
      ["site-inspection"],
      ["licence-issued"],
    ]);
  });

  it('resolves {"large-premises": true} with nothing excluded or undecided', () => {
    const graph = loadExample();
    const resolved = resolvePath(graph, { "large-premises": true });

    expect(resolved.excludedStepIds).toEqual([]);
    expect(resolved.undecidedStepIds).toEqual([]);
    expect(resolved.graph.nodes.length).toBe(4);
    expect(resolved.graph.edges.length).toBe(4);
  });

  it("does not mutate the input graph", () => {
    const graph = loadExample();
    const originalJson = JSON.stringify(graph);
    resolvePath(graph, { "large-premises": false });
    expect(JSON.stringify(graph)).toBe(originalJson);
  });
});
