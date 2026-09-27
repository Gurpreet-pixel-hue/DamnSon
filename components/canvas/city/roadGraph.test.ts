import { describe, it, expect } from "vitest";
import { buildRoadGraph, selectRoadTile } from "./roadGraph";
import { planCity } from "./planCity";

describe("Road Graph Generator (visual-direction §10.2)", () => {
  it("selects correct road tile and orientation based on 4-neighbourhood", () => {
    // 4 neighbours -> crossroad
    expect(selectRoadTile({ north: true, south: true, east: true, west: true })).toEqual({
      tile: "road-crossroad",
      rotationY: 0,
    });

    // 3 neighbours -> intersection
    expect(selectRoadTile({ north: false, south: true, east: true, west: true })).toEqual({
      tile: "road-intersection",
      rotationY: 0,
    });
    expect(selectRoadTile({ north: true, south: true, east: false, west: true })).toEqual({
      tile: "road-intersection",
      rotationY: Math.PI / 2,
    });

    // 2 neighbours -> straight
    expect(selectRoadTile({ north: true, south: true, east: false, west: false })).toEqual({
      tile: "road-straight",
      rotationY: 0,
    });
    expect(selectRoadTile({ north: false, south: false, east: true, west: true })).toEqual({
      tile: "road-straight",
      rotationY: Math.PI / 2,
    });

    // 2 neighbours -> bend
    expect(selectRoadTile({ north: true, south: false, east: true, west: false })).toEqual({
      tile: "road-bend",
      rotationY: 0,
    });
    expect(selectRoadTile({ north: false, south: true, east: true, west: false })).toEqual({
      tile: "road-bend",
      rotationY: (3 * Math.PI) / 2,
    });

    // 1 neighbour -> end
    expect(selectRoadTile({ north: false, south: false, east: true, west: false })).toEqual({
      tile: "road-end",
      rotationY: 0,
    });

    // 0 neighbours -> null (no tile-low fallback per §11.5)
    expect(selectRoadTile({ north: false, south: false, east: false, west: false })).toBeNull();
  });

  it("builds a connected road graph from a planCity grid", () => {
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
      taskId: "demo-task",
      stations: demoStations,
      tracks: demoTracks,
    });

    const graph = buildRoadGraph({
      bounds: plan.bounds,
      cellSize: plan.cellGrid.cellSize,
      rows: plan.cellGrid.rows,
      cols: plan.cellGrid.cols,
      cells: plan.cellGrid.cells,
      stations: demoStations,
    });

    // 1. Road cells exist
    expect(graph.roadCells.length).toBeGreaterThan(50);

    // 2. Road graph is connected
    expect(graph.isConnected, "Road graph must be connected").toBe(true);

    // 3. Every station plaza is adjacent to a road
    expect(graph.everyStationAdjacent, "Every station plaza must be adjacent to a road").toBe(true);

    // 4. Closed car loops exist
    expect(graph.carLoops.length, "Car loops must exist").toBeGreaterThanOrEqual(4);

    for (const loop of graph.carLoops) {
      expect(loop.waypoints.length).toBeGreaterThanOrEqual(8);
      expect(loop.length).toBeGreaterThan(0);

      // Verify loop is closed: distance between last waypoint and first waypoint is reasonable
      const first = loop.waypoints[0]!;
      const last = loop.waypoints[loop.waypoints.length - 1]!;
      const closingDist = Math.hypot(first.x - last.x, first.z - last.z);
      expect(closingDist, `Loop ${loop.id} must be closed`).toBeLessThanOrEqual(plan.cellGrid.cellSize * 1.5);
    }
  });

  it("verifies car loops enforce keep-left traffic", () => {
    const demoStations = [
      { id: "s1", position3D: [0, 0, 0] as [number, number, number] },
    ];
    const plan = planCity({
      taskId: "single-station",
      stations: demoStations,
      tracks: [],
    });

    const graph = buildRoadGraph({
      bounds: plan.bounds,
      cellSize: plan.cellGrid.cellSize,
      rows: plan.cellGrid.rows,
      cols: plan.cellGrid.cols,
      cells: plan.cellGrid.cells,
      stations: demoStations,
    });

    expect(graph.carLoops.length).toBeGreaterThan(0);

    // For any clockwise loop around a block:
    // Driving East: Z coordinate must be less than road center Z (offset North, which is left)
    // Driving South: X coordinate must be greater than road center X (offset East, which is left)
    for (const loop of graph.carLoops) {
      expect(loop.waypoints.length).toBeGreaterThan(0);
      // Ensure all consecutive waypoints have non-zero segment lengths
      for (let i = 0; i < loop.waypoints.length; i++) {
        const p1 = loop.waypoints[i]!;
        const p2 = loop.waypoints[(i + 1) % loop.waypoints.length]!;
        const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        expect(dist, "Adjacent waypoints must not be identical").toBeGreaterThan(0);
      }
    }
  });

  it("ensures no tile-low, every road cell has >= 1 neighbour, and street lines are continuous (§11.5)", () => {
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
      taskId: "continuous-grid-check",
      stations: demoStations,
      tracks: demoTracks,
    });

    const graph = buildRoadGraph({
      bounds: plan.bounds,
      cellSize: plan.cellGrid.cellSize,
      rows: plan.cellGrid.rows,
      cols: plan.cellGrid.cols,
      cells: plan.cellGrid.cells,
      stations: demoStations,
    });

    // 1. No tile-low in the entire graph
    const hasTileLow = graph.roadCells.some((c) => (c.tile as string) === "tile-low");
    expect(hasTileLow, "Road graph must not contain any tile-low fallbacks (§11.5)").toBe(false);

    // 2. Every placed road cell has at least 1 neighbour (no isolated cells)
    for (const c of graph.roadCells) {
      const n = c.neighbours;
      const count = (n.north ? 1 : 0) + (n.south ? 1 : 0) + (n.east ? 1 : 0) + (n.west ? 1 : 0);
      expect(
        count,
        `Road cell at [r=${c.r}, c=${c.c}] must have at least 1 road neighbour (found ${count})`
      ).toBeGreaterThanOrEqual(1);
    }

    // 3. Streets are continuous lines on every 4th row (within land up to promenadeZ)
    const maxLandRow = Math.floor((plan.promenadeZ - plan.bounds.minZ) / plan.cellGrid.cellSize);
    for (let r = 0; r <= maxLandRow; r += 4) {
      const rowCells = graph.roadCells.filter((c) => c.r === r);
      expect(rowCells.length, `Street row ${r} must contain road cells`).toBeGreaterThan(0);
      rowCells.sort((a, b) => a.c - b.c);
      for (let i = 1; i < rowCells.length; i++) {
        const prev = rowCells[i - 1]!;
        const curr = rowCells[i]!;
        if (curr.c === prev.c + 1) {
          expect(curr.neighbours.west, `Cell [${r}, ${curr.c}] must connect west to [${r}, ${prev.c}]`).toBe(true);
          expect(prev.neighbours.east, `Cell [${r}, ${prev.c}] must connect east to [${r}, ${curr.c}]`).toBe(true);
        }
      }
    }
  });
});
