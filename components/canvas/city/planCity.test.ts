import { describe, it, expect } from "vitest";
import { planCity, type StationLocation, type TrackLocation } from "./planCity";
import { CITY_KINDS, TRIANGLES_BY_KIND } from "./cityKinds";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import { journeyTemplateSchema, approvalModuleSchema } from "@/lib/contract/schema";
import { safeCompose } from "@/lib/graph/safeCompose";
import { fromJourney } from "@/lib/graph/viewModel";

function loadFixtureBundle(templateName: string) {
  const template = journeyTemplateSchema.parse(readTemplateFixture(templateName));
  const modules = template.modules.map((modEntry) =>
    approvalModuleSchema.parse(readModuleFixture(modEntry.moduleId))
  );
  return { template, modules };
}

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

  it("ensures no building sits on a corridor cell (F2)", () => {
    const plan = planCity({
      taskId: "corridor-check",
      stations: dummyStations,
      tracks: dummyTracks,
    });

    expect(plan.corridorCells.length).toBeGreaterThan(0);
    const { cellSize } = plan.cellGrid;

    for (const b of plan.buildings) {
      const c = Math.floor((b.position[0] - plan.bounds.minX) / cellSize);
      const r = Math.floor((b.position[2] - plan.bounds.minZ) / cellSize);
      const onCorridor = plan.corridorCells.some((cell) => cell.r === r && cell.c === c);
      expect(
        onCorridor,
        `Building ${b.kind} at [${b.position[0]}, ${b.position[2]}] sits on corridor cell [r=${r}, c=${c}]`
      ).toBe(false);
    }
  });
  it("plans the stress graph in under 150 ms (Amendment D5)", () => {
    const bundle = loadFixtureBundle("stress-25-synthetic");
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
    expect(plan.trees.length).toBeLessThanOrEqual(240);
    expect(plan.props.length).toBeLessThanOrEqual(40);
  });

  it("ensures no fill building is in the plaza cell of any station or in the 8 cells around it (G3)", () => {
    const plan = planCity({
      taskId: "plaza-clearing-check",
      stations: dummyStations,
      tracks: dummyTracks,
    });

    const { cellSize } = plan.cellGrid;
    for (const s of dummyStations) {
      const sc = Math.floor((s.position3D[0] - plan.bounds.minX) / cellSize);
      const sr = Math.floor((s.position3D[2] - plan.bounds.minZ) / cellSize);

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = sr + dr;
          const c = sc + dc;
          if (r >= 0 && r < plan.cellGrid.rows && c >= 0 && c < plan.cellGrid.cols) {
            // Must be marked plaza
            expect(plan.cellGrid.cells[r]![c]).toBe("plaza");

            // No building can be in this cell
            const cellCenterX = plan.bounds.minX + (c + 0.5) * cellSize;
            const cellCenterZ = plan.bounds.minZ + (r + 0.5) * cellSize;
            const hasBuilding = plan.buildings.some(
              (b) =>
                Math.abs(b.position[0] - cellCenterX) < 0.1 &&
                Math.abs(b.position[2] - cellCenterZ) < 0.1
            );
            expect(hasBuilding).toBe(false);
          }
        }
      }
    }
  });

  it("ensures fill buildings within 3 cells of a station are capped at 0.7 * that station's height (G3)", () => {
    const stationsWithHeight: StationLocation[] = [
      { id: "s1", position3D: [0, 0, 0], height: 3.5 },
      { id: "s2", position3D: [14, 0, 0], height: 2.8 },
    ];
    const plan = planCity({
      taskId: "height-cap-check",
      stations: stationsWithHeight,
      tracks: [],
    });

    const { cellSize } = plan.cellGrid;

    for (const b of plan.buildings) {
      const c = Math.floor((b.position[0] - plan.bounds.minX) / cellSize);
      const r = Math.floor((b.position[2] - plan.bounds.minZ) / cellSize);

      let minStationCellDist = Infinity;
      let nearestStation: StationLocation | null = null;
      for (const s of stationsWithHeight) {
        const sc = Math.floor((s.position3D[0] - plan.bounds.minX) / cellSize);
        const sr = Math.floor((s.position3D[2] - plan.bounds.minZ) / cellSize);
        const cellDist = Math.max(Math.abs(r - sr), Math.abs(c - sc));
        if (cellDist < minStationCellDist) {
          minStationCellDist = cellDist;
          nearestStation = s;
        }
      }

      if (minStationCellDist <= 3 && nearestStation) {
        const stationH = nearestStation.height ?? 3.0;
        const maxAllowed = 0.7 * stationH;
        // Verify building height with scale does not exceed cap
        // The scale[1] was capped to ensure variant.height * scale[1] <= maxAllowed
        expect(b.scale[1] * 2.0).toBeGreaterThan(0); // non-zero
        // Look up kind height from CITY_KINDS
        const kindInfo = CITY_KINDS.find((k) => k.name === b.kind);
        if (kindInfo) {
          const effectiveHeight = kindInfo.height * b.scale[1];
          expect(effectiveHeight).toBeLessThanOrEqual(maxAllowed + 0.001);
        }
      }
    }
  });

  it("satisfies H1 occupancy and caps for demo and stress fixtures", () => {
    for (const graphName of ["demo", "stress"]) {
      const bundle = loadFixtureBundle(
        graphName === "stress" ? "stress-25-synthetic" : "demo-metro-synthetic"
      );
      expect(bundle).not.toBeNull();
      const composeResult = safeCompose(bundle!.template, bundle!.modules, {});
      expect(composeResult.ok).toBe(true);
      if (!composeResult.ok) continue;

      const metro = fromJourney(composeResult.journey, new Set());
      const stations: StationLocation[] = metro.stations.map((s) => ({
        id: s.id,
        position3D: s.position3D,
      }));
      const tracks: TrackLocation[] = metro.tracks.map((t) => ({
        id: t.id,
        from: t.from,
        to: t.to,
      }));

      const plan = planCity({
        taskId: bundle!.template.taskId,
        stations,
        tracks,
      });

      // 1. Caps
      expect(plan.buildings.length).toBeLessThanOrEqual(260);
      expect(plan.trees.length).toBeLessThanOrEqual(180);

      // 2. No building in a plaza cell
      const { cellSize } = plan.cellGrid;
      for (const b of plan.buildings) {
        const c = Math.floor((b.position[0] - plan.bounds.minX) / cellSize);
        const r = Math.floor((b.position[2] - plan.bounds.minZ) / cellSize);
        expect(plan.cellGrid.cells[r]![c]).not.toBe("plaza");
      }

      // 3. At least 60% of non-road, non-plaza, non-water cells within 5 cells of any station hold a building
      let eligibleNearCells = 0;
      let occupiedNearCells = 0;

      for (let r = 0; r < plan.cellGrid.rows; r++) {
        for (let c = 0; c < plan.cellGrid.cols; c++) {
          const type = plan.cellGrid.cells[r]![c];
          if (type === "road" || type === "plaza" || type === "water") continue;

          let within5Cells = false;
          for (const s of stations) {
            const sc = Math.floor((s.position3D[0] - plan.bounds.minX) / cellSize);
            const sr = Math.floor((s.position3D[2] - plan.bounds.minZ) / cellSize);
            if (Math.max(Math.abs(r - sr), Math.abs(c - sc)) <= 5) {
              within5Cells = true;
              break;
            }
          }

          if (within5Cells) {
            eligibleNearCells++;
            const cellCenterX = plan.bounds.minX + (c + 0.5) * cellSize;
            const cellCenterZ = plan.bounds.minZ + (r + 0.5) * cellSize;
            const hasBuilding = plan.buildings.some(
              (b) =>
                Math.abs(b.position[0] - cellCenterX) < 0.1 &&
                Math.abs(b.position[2] - cellCenterZ) < 0.1
            );
            if (hasBuilding) {
              occupiedNearCells++;
            }
          }
        }
      }

      const occupancyPct = (occupiedNearCells / eligibleNearCells) * 100;
      console.log(
        `[H1 OCCUPANCY] ${graphName}: ${occupiedNearCells}/${eligibleNearCells} (${occupancyPct.toFixed(1)}%), buildings=${plan.buildings.length}, trees=${plan.trees.length}`
      );
      expect(occupancyPct).toBeGreaterThanOrEqual(60);
    }
  });

  it("satisfies the ≤ 300k triangle budget estimate for demo and stress (A7)", () => {
    for (const graphName of ["demo", "stress"]) {
      const templateName =
        graphName === "demo" ? "demo-metro-synthetic" : "stress-25-synthetic";
      const bundle = loadFixtureBundle(templateName);
      const composeResult = safeCompose(bundle.template, bundle.modules, {});
      expect(composeResult.ok).toBe(true);
      if (!composeResult.ok) continue;

      const metro = fromJourney(composeResult.journey, new Set());
      const stations: StationLocation[] = metro.stations.map((s) => ({
        id: s.id,
        position3D: s.position3D,
        height: s.height,
      }));
      const tracks: TrackLocation[] = metro.tracks.map((t) => ({
        id: t.id,
        from: t.from,
        to: t.to,
      }));

      const plan = planCity({
        taskId: bundle.template.taskId,
        stations,
        tracks,
      });

      // Sum per-kind triangle counts from cityKinds table (A7)
      let totalTriangles = 0;
      for (const b of plan.buildings) {
        totalTriangles += TRIANGLES_BY_KIND[b.kind] ?? 0;
      }
      for (const t of plan.trees) {
        totalTriangles += TRIANGLES_BY_KIND[t.kind] ?? 0;
      }
      for (const p of plan.props) {
        totalTriangles += TRIANGLES_BY_KIND[p.kind] ?? 0;
      }

      console.log(
        `[A7 TRIANGLE BUDGET] ${graphName}: ${totalTriangles.toLocaleString()} triangles (target <= 300,000)`
      );
      expect(totalTriangles).toBeLessThanOrEqual(300_000);
    }
  });

  it("ensures every placed building has uniform scale without y-squashing (A7 & visual-direction §10.1)", () => {
    for (const graphName of ["demo", "stress"]) {
      const templateName =
        graphName === "demo" ? "demo-metro-synthetic" : "stress-25-synthetic";
      const bundle = loadFixtureBundle(templateName);
      const composeResult = safeCompose(bundle.template, bundle.modules, {});
      if (!composeResult.ok) continue;
      const metro = fromJourney(composeResult.journey, new Set());
      const plan = planCity({
        taskId: bundle.template.taskId,
        stations: metro.stations.map((s) => ({ id: s.id, position3D: s.position3D, height: s.height })),
        tracks: metro.tracks.map((t) => ({ id: t.id, from: t.from, to: t.to })),
      });

      for (const b of plan.buildings) {
        expect(b.scale[0]).toBeCloseTo(b.scale[1], 5);
        expect(b.scale[1]).toBeCloseTo(b.scale[2], 5);
      }
    }
  });
});
