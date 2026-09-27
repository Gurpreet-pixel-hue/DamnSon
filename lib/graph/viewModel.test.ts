import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { civicTaskGraphSchema, type CivicTaskGraph } from "./schema";
import { resolvePath } from "./resolvePath";
import { computeMetroLayout } from "./layout";
import { fromV2 } from "./viewModel";

function loadFixture(relPath: string): CivicTaskGraph {
  const fullPath = path.resolve(process.cwd(), relPath);
  return civicTaskGraphSchema.parse(
    JSON.parse(fs.readFileSync(fullPath, "utf8"))
  );
}

describe("fromV2 view model adapter", () => {
  const demoGraph = loadFixture("data/fixtures/demo/demo-metro.json");

  it("maps demo graph to stations with unique positions and same layers as computeMetroLayout", () => {
    const resolved = resolvePath(demoGraph, {});
    const placements = computeMetroLayout(resolved);
    const completed = new Set<string>();

    const metro = fromV2(resolved, completed);

    expect(metro.stations.length).toBe(resolved.graph.nodes.length);
    expect(metro.stations.length).toBe(placements.length);

    // Positions must be unique
    const pos3DSet = new Set<string>();
    const pos2DSet = new Set<string>();

    for (const station of metro.stations) {
      const p3 = station.position3D.join(",");
      const p2 = `${station.position2D.x},${station.position2D.y}`;
      expect(pos3DSet.has(p3)).toBe(false);
      expect(pos2DSet.has(p2)).toBe(false);
      pos3DSet.add(p3);
      pos2DSet.add(p2);
    }

    // Layers and lanes must match computeMetroLayout placements
    const placementMap = new Map(placements.map((p) => [p.stepId, p]));
    for (const station of metro.stations) {
      const p = placementMap.get(station.id);
      expect(p).toBeDefined();
      expect(station.layer).toBe(p!.layer);
      expect(station.lane).toBe(p!.lane);
      expect(station.position3D).toEqual(p!.position3D);
      expect(station.position2D).toEqual(p!.position2D);
      expect(station.kind).toBe("government");
    }
  });

  it("maps station states and applicability accurately", () => {
    // Unanswered answers => conditional steps are undecided
    const resolved = resolvePath(demoGraph, {});
    const initialMetro = fromV2(resolved, new Set(["s01-portal-signup"]));

    const doneStation = initialMetro.stations.find(
      (s) => s.id === "s01-portal-signup"
    );
    expect(doneStation?.state).toBe("done");

    // Undecided steps in resolved.undecidedStepIds must have may_apply
    for (const undecidedId of resolved.undecidedStepIds) {
      const station = initialMetro.stations.find((s) => s.id === undecidedId);
      expect(station?.applicability).toBe("may_apply");
    }

    // When all questions are answered, undecided steps resolve
    const answeredResolved = resolvePath(demoGraph, {
      "q-large-area": false,
      "q-commercial-power": false,
      "q-heritage-zone": false,
    });
    expect(answeredResolved.undecidedStepIds.length).toBe(0);
    const answeredMetro = fromV2(answeredResolved, new Set());
    for (const station of answeredMetro.stations) {
      const node = answeredResolved.graph.nodes.find((n) => n.id === station.id);
      if (node?.requirement.kind === "optional") {
        expect(station.applicability).toBe("optional");
      } else {
        expect(station.applicability).toBe("applies");
      }
    }
  });

  it("computes track attributes: critical, toAvailable, dashed", () => {
    const resolved = resolvePath(demoGraph, {});
    const metro = fromV2(resolved, new Set());

    expect(metro.tracks.length).toBe(resolved.graph.edges.length);

    for (const track of metro.tracks) {
      expect(track.kind).toBe("requires");
      const targetStation = metro.stations.find((s) => s.id === track.to);
      expect(track.toAvailable).toBe(targetStation?.state === "available");

      const sourceStation = metro.stations.find((s) => s.id === track.from);
      const shouldBeDashed =
        sourceStation?.applicability === "may_apply" ||
        sourceStation?.applicability === "optional" ||
        targetStation?.applicability === "may_apply" ||
        targetStation?.applicability === "optional";

      expect(track.dashed).toBe(shouldBeDashed);
    }
  });
});
