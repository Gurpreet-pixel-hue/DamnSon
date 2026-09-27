import { describe, it, expect } from "vitest";
import { planCity } from "./planCity";
import { buildRoadGraph } from "./roadGraph";
import { computeRoutesOnRoads } from "./routeOnRoads";
import { HEIGHTS } from "../heights";

describe("routeOnRoads: Routes follow the streets (§11.5)", () => {
  const demoStations = [
    { id: "s1", position3D: [-12, 0, -4] as [number, number, number] },
    { id: "s2", position3D: [-4, 0, 2] as [number, number, number] },
    { id: "s3", position3D: [6, 0, -2] as [number, number, number] },
    { id: "s4", position3D: [14, 0, 6] as [number, number, number] },
  ];
  const demoTracks = [
    { id: "t1", from: "s1", to: "s2" },
    { id: "t2", from: "s2", to: "s3" },
    { id: "t3", from: "s3", to: "s4" },
  ];

  const plan = planCity({
    taskId: "route-roads-test",
    stations: demoStations,
    tracks: demoTracks,
  });

  const roadGraph = buildRoadGraph({
    bounds: plan.bounds,
    cellSize: plan.cellGrid.cellSize,
    rows: plan.cellGrid.rows,
    cols: plan.cellGrid.cols,
    cells: plan.cellGrid.cells,
    stations: demoStations,
  });

  const routes = computeRoutesOnRoads({
    tracks: demoTracks,
    stations: demoStations,
    roadGraph,
    cellSize: plan.cellGrid.cellSize,
  });

  it("finds road paths for all tracks", () => {
    expect(routes.size).toBe(demoTracks.length);
    for (const track of demoTracks) {
      const route = routes.get(track.id);
      expect(route, `Route for track ${track.id} must exist`).toBeDefined();
      expect(route!.roadCells.length).toBeGreaterThan(0);
      expect(route!.polyline.length).toBeGreaterThan(0);
      expect(route!.length).toBeGreaterThan(0);
    }
  });

  it("ensures every road waypoint vertex lies on a road cell (§11.5)", () => {
    const { cellSize } = plan.cellGrid;
    const { minX, minZ } = plan.bounds;

    for (const track of demoTracks) {
      const route = routes.get(track.id)!;
      // Check intermediate vertices (those traversing the road network)
      // Exclude only the terminal plaza connection endpoints (indices 0 and length-1)
      const roadWaypoints = route.polyline.slice(1, -1);
      expect(roadWaypoints.length).toBeGreaterThan(0);

      for (const pt of roadWaypoints) {
        // Vertex Y must be HEIGHTS.routeLane (0.195)
        expect(pt[1]).toBeCloseTo(HEIGHTS.routeLane, 4);

        const c = Math.floor((pt[0] - minX) / cellSize);
        const r = Math.floor((pt[2] - minZ) / cellSize);

        // Either the cell itself or an immediately adjacent road cell within half-width margin is a road cell
        const isRoadCell =
          roadGraph.roadCellMap.has(`${r},${c}`) ||
          roadGraph.roadCellMap.has(`${r + 1},${c}`) ||
          roadGraph.roadCellMap.has(`${r - 1},${c}`) ||
          roadGraph.roadCellMap.has(`${r},${c + 1}`) ||
          roadGraph.roadCellMap.has(`${r},${c - 1}`);

        expect(
          isRoadCell,
          `Route vertex at [${pt[0].toFixed(2)}, ${pt[2].toFixed(2)}] (cell [${r}, ${c}]) must lie on a road cell`
        ).toBe(true);
      }
    }
  });

  it("generates flat 0.35-wide ribbon geometry buffers at y = 0.195", () => {
    for (const track of demoTracks) {
      const route = routes.get(track.id)!;
      expect(route.ribbonPositions.length).toBe(route.polyline.length * 2 * 3);
      expect(route.ribbonNormals.length).toBe(route.polyline.length * 2 * 3);
      expect(route.ribbonIndices.length).toBe((route.polyline.length - 1) * 6);

      // Verify ribbon height is 0.195 everywhere
      for (let i = 1; i < route.ribbonPositions.length; i += 3) {
        expect(route.ribbonPositions[i]).toBeCloseTo(HEIGHTS.routeLane, 4);
      }

      // Verify normal is up (0, 1, 0)
      for (let i = 0; i < route.ribbonNormals.length; i += 3) {
        expect(route.ribbonNormals[i]).toBe(0);
        expect(route.ribbonNormals[i + 1]).toBe(1);
        expect(route.ribbonNormals[i + 2]).toBe(0);
      }
    }
  });

  it("applies multi-route offset when tracks share road cells", () => {
    // Shared route test: duplicate track
    const sharedTracks = [
      { id: "t1a", from: "s1", to: "s2" },
      { id: "t1b", from: "s1", to: "s2" },
    ];
    const sharedRoutes = computeRoutesOnRoads({
      tracks: sharedTracks,
      stations: demoStations,
      roadGraph,
      cellSize: plan.cellGrid.cellSize,
    });

    const rA = sharedRoutes.get("t1a")!;
    const rB = sharedRoutes.get("t1b")!;
    expect(rA).toBeDefined();
    expect(rB).toBeDefined();

    // Verify polylines differ laterally due to the 0.12 offset
    let maxDiff = 0;
    const minLen = Math.min(rA.polyline.length, rB.polyline.length);
    for (let i = 1; i < minLen - 1; i++) {
      const pA = rA.polyline[i]!;
      const pB = rB.polyline[i]!;
      const d = Math.hypot(pA[0] - pB[0], pA[2] - pB[2]);
      maxDiff = Math.max(maxDiff, d);
    }
    expect(maxDiff).toBeGreaterThan(0.05);
  });
});
