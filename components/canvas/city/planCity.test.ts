import { describe, it, expect } from "vitest";
import { planCity, type StationLocation, type TrackLocation } from "./planCity";
import { loadJourneyForPage } from "@/app/loadJourney";
import { safeCompose } from "@/lib/graph/safeCompose";
import { fromJourney } from "@/lib/graph/viewModel";

describe("planCity (visual-direction §3 & Amendment D5)", () => {
  const dummyStations: StationLocation[] = [
    { id: "s1", position3D: [0, 0, 0] },
    { id: "s2", position3D: [7, 0, 4.5] },
    { id: "s3", position3D: [14, 0, -4.5] },
    { id: "s4", position3D: [21, 0, 0] },
  ];

  const dummyTracks: TrackLocation[] = [
    { id: "t1", from: "s1", to: "s2" },
    { id: "t2", from: "s2", to: "s3" },
    { id: "t3", from: "s3", to: "s4" },
  ];

  it("produces identical output for the same seed/taskId", () => {
    const planA = planCity({
      taskId: "test-task",
      stations: dummyStations,
      tracks: dummyTracks,
    });

    const planB = planCity({
      taskId: "test-task",
      stations: dummyStations,
      tracks: dummyTracks,
    });

    expect(planA.buildings).toEqual(planB.buildings);
    expect(planA.trees).toEqual(planB.trees);
    expect(planA.props).toEqual(planB.props);
    expect(planA.bounds).toEqual(planB.bounds);
  });

  it("produces different layouts for different taskIds", () => {
    const planA = planCity({
      taskId: "task-alpha",
      stations: dummyStations,
      tracks: dummyTracks,
    });

    const planB = planCity({
      taskId: "task-beta",
      stations: dummyStations,
      tracks: dummyTracks,
    });

    expect(planA.buildings).not.toEqual(planB.buildings);
  });

  it("ensures no building overlaps a plaza or road corridor", () => {
    const plan = planCity({
      taskId: "overlap-check",
      stations: dummyStations,
      tracks: dummyTracks,
    });

    // Verify against cell classifications
    const { cells } = plan.cellGrid;
    for (const b of plan.buildings) {
      // Find the cell coordinates
      const c = Math.floor((b.position[0] - plan.bounds.minX) / plan.cellGrid.cellSize);
      const r = Math.floor((b.position[2] - plan.bounds.minZ) / plan.cellGrid.cellSize);

      const cellType = cells[r]?.[c];
      expect(cellType, `Building at [${b.position[0]}, ${b.position[2]}] must not be on plaza or road`).not.toBe("plaza");
      expect(cellType, `Building at [${b.position[0]}, ${b.position[2]}] must not be on plaza or road`).not.toBe("road");
      expect(cellType, `Building at [${b.position[0]}, ${b.position[2]}] must not be on plaza or road`).not.toBe("water");
    }
  });

  it("ensures every prop-boat cell is a water cell (E4)", () => {
    const plan = planCity({
      taskId: "boats-water-check",
      stations: dummyStations,
      tracks: dummyTracks,
    });

    const boatProps = plan.props.filter((p) => p.kind.includes("boat"));
    expect(boatProps.length).toBeGreaterThan(0);

    const { cells, cellSize } = plan.cellGrid;
    for (const boat of boatProps) {
      const c = Math.floor((boat.position[0] - plan.bounds.minX) / cellSize);
      const r = Math.floor((boat.position[2] - plan.bounds.minZ) / cellSize);
      expect(cells[r]?.[c], `Boat at [${boat.position[0]}, ${boat.position[2]}] must be on water cell`).toBe("water");
      expect(boat.position[1], "Boat must float at y = 0.02 water level").toBe(0.02);
    }
  });

  it("ensures every building sits inside a 3x3 block and never on a street, plaza or road (E5)", () => {
    const plan = planCity({
      taskId: "block-placement-check",
      stations: dummyStations,
      tracks: dummyTracks,
    });

    const { cells, cellSize } = plan.cellGrid;
    for (const b of plan.buildings) {
      const c = Math.floor((b.position[0] - plan.bounds.minX) / cellSize);
      const r = Math.floor((b.position[2] - plan.bounds.minZ) / cellSize);

      // Must be inside block: r % 4 !== 0 and c % 4 !== 0
      expect(r % 4, `Building cell row ${r} must not be on street row`).not.toBe(0);
      expect(c % 4, `Building cell col ${c} must not be on street col`).not.toBe(0);

      const cellType = cells[r]?.[c];
      expect(cellType, `Building cell must be 'building'`).toBe("building");
    }
  });

  it("ensures no two adjacent cells have the same building variant (E5)", () => {
    const plan = planCity({
      taskId: "no-adjacent-duplicates-check",
      stations: dummyStations,
      tracks: dummyTracks,
    });

    const { rows, cols, cellSize } = plan.cellGrid;
    const grid: (string | null)[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => null)
    );

    for (const b of plan.buildings) {
      const c = Math.floor((b.position[0] - plan.bounds.minX) / cellSize);
      const r = Math.floor((b.position[2] - plan.bounds.minZ) / cellSize);
      grid[r]![c] = b.kind;
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const current = grid[r]![c];
        if (!current) continue;

        if (r > 0 && grid[r - 1]?.[c]) {
          expect(grid[r - 1]![c], `Building at [${r}, ${c}] must not duplicate adjacent north [${r - 1}, ${c}]`).not.toBe(current);
        }
        if (c > 0 && grid[r]?.[c - 1]) {
          expect(grid[r]![c - 1], `Building at [${r}, ${c}] must not duplicate adjacent west [${r}, ${c - 1}]`).not.toBe(current);
        }
      }
    }
  });

  it("enforces maximum caps on buildings, trees, and props", () => {
    const plan = planCity({
      taskId: "caps-check",
      stations: dummyStations,
      tracks: dummyTracks,
    });

    expect(plan.buildings.length).toBeLessThanOrEqual(260);
    expect(plan.trees.length).toBeLessThanOrEqual(180);
    expect(plan.props.length).toBeLessThanOrEqual(40);
  });

  it("plans the stress graph in under 150 ms (Amendment D5)", async () => {
    process.env.DATA_SOURCE = "fixtures";
    const bundle = await loadJourneyForPage({ graph: "stress" });
    expect(bundle, "Stress fixture bundle must load").not.toBeNull();

    const composeResult = safeCompose(bundle!.template, bundle!.modules, {});
    expect(composeResult.ok, "Stress journey must compose successfully").toBe(true);
    if (!composeResult.ok) {
      throw new Error(`Compose failed: ${composeResult.message}`);
    }

    const metro = fromJourney(composeResult.journey, new Set());
    expect(metro.stations.length).toBeGreaterThanOrEqual(24);

    const stations: StationLocation[] = metro.stations.map((s) => ({
      id: s.id,
      position3D: s.position3D,
    }));
    const tracks: TrackLocation[] = metro.tracks.map((t) => ({
      id: t.id,
      from: t.from,
      to: t.to,
    }));

    const startTime = performance.now();
    const plan = planCity({
      taskId: bundle!.template.taskId,
      stations,
      tracks,
    });
    const elapsed = performance.now() - startTime;

    console.log(`[Amendment D5] planCity stress test elapsed time: ${elapsed.toFixed(2)} ms`);
    expect(elapsed, "planCity must complete in under 150 ms").toBeLessThan(150);

    // Verify stress caps
    expect(plan.buildings.length).toBeLessThanOrEqual(260);
    expect(plan.trees.length).toBeLessThanOrEqual(180);
    expect(plan.props.length).toBeLessThanOrEqual(40);
  });
});
