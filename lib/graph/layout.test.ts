import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { computeMetroLayout, LAYOUT } from "./layout";
import { resolvePath } from "./resolvePath";
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

describe("layout", () => {
  it("computes metro layout for {} matching exact expectations", () => {
    const graph = loadExample();
    const resolved = resolvePath(graph, {});
    const placements = computeMetroLayout(resolved);

    expect(placements.map((p) => p.stepId)).toEqual([
      "apply-online",
      "site-inspection",
      "fire-clearance",
      "licence-issued",
    ]);

    expect(placements[0]).toEqual({
      stepId: "apply-online",
      layer: 0,
      lane: 0,
      position3D: [0, 2.2, 0],
      position2D: { x: 0, y: 0 },
    });

    expect(placements[1]).toEqual({
      stepId: "site-inspection",
      layer: 1,
      lane: -0.5,
      position3D: [7, 0, -2.25],
      position2D: { x: 280, y: -70 },
    });

    expect(placements[2]).toEqual({
      stepId: "fire-clearance",
      layer: 1,
      lane: 0.5,
      position3D: [7, 0, 2.25],
      position2D: { x: 280, y: 70 },
    });

    expect(placements[3]).toEqual({
      stepId: "licence-issued",
      layer: 2,
      lane: 0,
      position3D: [14, 2.2, 0],
      position2D: { x: 560, y: 0 },
    });
  });

  it("exports exact LAYOUT constants", () => {
    expect(LAYOUT).toEqual({
      layerSpacing3D: 7,
      laneSpacing3D: 4.5,
      onlineHeight: 2.2,
      layerSpacing2D: 280,
      laneSpacing2D: 140,
    });
  });
});
