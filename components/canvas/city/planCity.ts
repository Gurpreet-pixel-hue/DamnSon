/**
 * Civic Metro City Plan Generator
 *
 * Pure TypeScript, deterministic, no THREE imports (visual-direction §3).
 * Generates diorama bounds, cell classification, building placements,
 * tree instances, and prop positions.
 */

import {
  LOW_BUILDINGS,
  MID_BUILDINGS,
  LOW_DETAIL_BUILDINGS,
  type CityKindInfo,
} from "./cityKinds";

export interface StationLocation {
  id: string;
  position3D: [number, number, number];
  height?: number;
}

export interface TrackLocation {
  id: string;
  from: string;
  to: string;
}

export interface BoardBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
}

export interface PlacedInstance {
  kind: string;
  position: [number, number, number];
  rotationY: number;
  scale: [number, number, number];
}

export type CellType = "plaza" | "road" | "water" | "park" | "building";

export interface CityPlan {
  bounds: BoardBounds;
  promenadeZ: number;
  cellGrid: {
    cols: number;
    rows: number;
    cellSize: number;
    cells: CellType[][];
  };
  corridorCells: Array<{ r: number; c: number }>;
  buildings: PlacedInstance[];
  trees: PlacedInstance[];
  props: PlacedInstance[];
  roadSegments: Array<{ from: [number, number]; to: [number, number] }>;
}

export interface PlanCityOptions {
  taskId: string;
  stations: StationLocation[];
  tracks: TrackLocation[];
}

/**
 * 32-bit FNV-1a hash function for strings
 */
function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

/**
 * Deterministic mulberry32 PRNG
 */
function createPRNG(seed: number) {
  let s = seed >>> 0;
  return function rand(): number {
    let t = (s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Point on cubic Bezier curve
 */
function cubicBezierPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number
): [number, number] {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return [
    mt3 * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t3 * p3[0],
    mt3 * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t3 * p3[1],
  ];
}

export function computeBoardBounds(stations: StationLocation[]): BoardBounds {
  if (stations.length === 0) {
    return {
      minX: -21,
      maxX: 21,
      minZ: -21,
      maxZ: 21,
      width: 42,
      depth: 42,
      centerX: 0,
      centerZ: 0,
    };
  }

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const s of stations) {
    minX = Math.min(minX, s.position3D[0]);
    maxX = Math.max(maxX, s.position3D[0]);
    minZ = Math.min(minZ, s.position3D[2]);
    maxZ = Math.max(maxZ, s.position3D[2]);
  }

  // G2: Extend board bounds beyond the framed area so no bare background shows
  const rawWidth = Math.max(maxX - minX + 56, 98);
  const rawDepth = Math.max(maxZ - minZ + 84, 112);

  const width = Math.ceil(rawWidth / 7) * 7;
  const depth = Math.ceil(rawDepth / 7) * 7;

  const centerX = (minX + maxX) / 2;
  // Shift board center toward -Z so ground extends far behind stations
  const centerZ = (minZ + maxZ) / 2 - 14;

  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
    width,
    depth,
    centerX,
    centerZ,
  };
}

export function planCity(options: PlanCityOptions): CityPlan {
  const { taskId, stations, tracks } = options;
  const rand = createPRNG(hashString(taskId + ":city"));

  const bounds = computeBoardBounds(stations);
  const promenadeZ = bounds.maxZ - 10;
  const cellSize = 1.75;

  const cols = Math.floor(bounds.width / cellSize);
  const rows = Math.floor(bounds.depth / cellSize);

  // 1. Identify cells crossed by route corridors
  const stationMap = new Map(stations.map((s) => [s.id, s.position3D]));
  const isCorridor: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false)
  );

  for (const t of tracks) {
    const pStart = stationMap.get(t.from);
    const pEnd = stationMap.get(t.to);
    if (!pStart || !pEnd) continue;

    const p0: [number, number] = [pStart[0] + 0.7, pStart[2]];
    const p3: [number, number] = [pEnd[0] - 0.7, pEnd[2]];
    const dx = p3[0] - p0[0];
    const p1: [number, number] = [p0[0] + dx * 0.4, p0[1]];
    const p2: [number, number] = [p0[0] + dx * 0.6, p3[1]];

    const SAMPLES = 60;
    let prev = p0;
    for (let i = 0; i <= SAMPLES; i++) {
      const curr = cubicBezierPoint(p0, p1, p2, p3, i / SAMPLES);
      const dist = Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);
      const subSteps = Math.max(1, Math.ceil(dist / (cellSize * 0.25)));
      for (let s = 0; s <= subSteps; s++) {
        const tSub = s / subSteps;
        const sx = prev[0] + (curr[0] - prev[0]) * tSub;
        const sz = prev[1] + (curr[1] - prev[1]) * tSub;
        const c = Math.floor((sx - bounds.minX) / cellSize);
        const r = Math.floor((sz - bounds.minZ) / cellSize);
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          isCorridor[r]![c] = true;
        }
      }
      prev = curr;
    }
  }

  const corridorCells: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isCorridor[r]![c]) {
        corridorCells.push({ r, c });
      }
    }
  }

  // Straight street grid segments
  const roadSegments: Array<{ from: [number, number]; to: [number, number] }> = [];
  roadSegments.push({
    from: [bounds.minX, promenadeZ],
    to: [bounds.maxX, promenadeZ],
  });

  for (let r = 0; r < rows; r += 4) {
    const sz = bounds.minZ + (r + 0.5) * cellSize;
    if (sz <= promenadeZ) {
      roadSegments.push({
        from: [bounds.minX, sz],
        to: [bounds.maxX, sz],
      });
    }
  }
  for (let c = 0; c < cols; c += 4) {
    const sx = bounds.minX + (c + 0.5) * cellSize;
    roadSegments.push({
      from: [sx, bounds.minZ],
      to: [sx, promenadeZ],
    });
  }

  // 2. Classify Grid Cells
  // Cells array: cells[r][c]
  const cells: CellType[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => "building" as CellType)
  );

  const occupied = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false)
  );

  // G3: Pre-mark the plaza cell of each station and the 8 cells around it (9-cell block)
  const isStationPlaza: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false)
  );
  for (const s of stations) {
    const sc = Math.floor((s.position3D[0] - bounds.minX) / cellSize);
    const sr = Math.floor((s.position3D[2] - bounds.minZ) / cellSize);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = sr + dr;
        const c = sc + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          isStationPlaza[r]![c] = true;
        }
      }
    }
  }

  const freeCellIndices: Array<{ r: number; c: number; x: number; z: number }> = [];

  for (let r = 0; r < rows; r++) {
    const cz = bounds.minZ + (r + 0.5) * cellSize;
    for (let c = 0; c < cols; c++) {
      const cx = bounds.minX + (c + 0.5) * cellSize;

      // Water: band 10 units deep along camera-facing (+z) edge
      if (cz > promenadeZ) {
        cells[r]![c] = "water";
        continue;
      }

      // Plaza: station plaza cell and the 8 cells around it (G3), or within 1.6 units
      if (isStationPlaza[r]![c]) {
        cells[r]![c] = "plaza";
        continue;
      }

      let isPlaza = false;
      for (const s of stations) {
        const dSq = (cx - s.position3D[0]) ** 2 + (cz - s.position3D[2]) ** 2;
        if (dSq <= 1.6 * 1.6) {
          isPlaza = true;
          break;
        }
      }
      if (isPlaza) {
        cells[r]![c] = "plaza";
        continue;
      }

      // Road: corridor cells, promenade, or street grid
      let isRoad = false;
      if (Math.abs(cz - promenadeZ) <= 0.9) {
        isRoad = true;
      }
      if (r % 4 === 0 || c % 4 === 0) {
        isRoad = true;
      }
      if (isCorridor[r]![c]) {
        isRoad = true;
      }

      if (isRoad) {
        cells[r]![c] = "road";
        continue;
      }

      freeCellIndices.push({ r, c, x: cx, z: cz });
    }
  }

  // 3. Parks: about 12% of block cells per E5
  const parkTargetCount = Math.floor(freeCellIndices.length * 0.12);
  const numClusters = Math.max(1, Math.min(6, Math.floor(parkTargetCount / 4)));
  const parkClusterCenters: Array<{ x: number; z: number; radiusSq: number }> = [];

  for (let i = 0; i < numClusters; i++) {
    const center = freeCellIndices[Math.floor(rand() * freeCellIndices.length)];
    if (center) {
      parkClusterCenters.push({
        x: center.x,
        z: center.z,
        radiusSq: (3.0 + rand() * 2.0) ** 2,
      });
    }
  }

  let parkCount = 0;
  for (const item of freeCellIndices) {
    if (parkCount >= parkTargetCount) break;
    for (const cluster of parkClusterCenters) {
      const dSq = (item.x - cluster.x) ** 2 + (item.z - cluster.z) ** 2;
      if (dSq <= cluster.radiusSq) {
        cells[item.r]![item.c] = "park";
        parkCount++;
        break;
      }
    }
  }
  if (parkCount < parkTargetCount) {
    for (const item of freeCellIndices) {
      if (parkCount >= parkTargetCount) break;
      if (cells[item.r]![item.c] !== "park") {
        cells[item.r]![item.c] = "park";
        parkCount++;
      }
    }
  }

  // 4. Place Buildings (H1: nearest-first up to 260)
  // E5: Buildings fill 3x3 blocks between streets.
  // Density: low-rise 2-6 units from stations; mid-rise 6-14; tall beyond 14 ONLY in back third.
  // No adjacent duplicates; rotation in 90 deg steps; height Y=0.17 above board basin.
  const buildings: PlacedInstance[] = [];
  const MAX_BUILDINGS = 260;
  const placedVariantGrid: (string | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );

  interface CandidateBuildingCell {
    r: number;
    c: number;
    cx: number;
    cz: number;
    distSq: number;
    dist: number;
    minStationCellDist: number;
    nearestStation: StationLocation | null;
    tieBreaker: number;
  }

  const candidateBuildingCells: CandidateBuildingCell[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r]![c] !== "building") continue;

      const cx = bounds.minX + (c + 0.5) * cellSize;
      const cz = bounds.minZ + (r + 0.5) * cellSize;

      let minDistSq = Infinity;
      let minStationCellDist = Infinity;
      let nearestStation: StationLocation | null = null;

      for (const s of stations) {
        const dSq = (cx - s.position3D[0]) ** 2 + (cz - s.position3D[2]) ** 2;
        if (dSq < minDistSq) minDistSq = dSq;

        const sc = Math.floor((s.position3D[0] - bounds.minX) / cellSize);
        const sr = Math.floor((s.position3D[2] - bounds.minZ) / cellSize);
        const cellDist = Math.max(Math.abs(r - sr), Math.abs(c - sc));
        if (cellDist < minStationCellDist) {
          minStationCellDist = cellDist;
          nearestStation = s;
        }
      }

      candidateBuildingCells.push({
        r,
        c,
        cx,
        cz,
        distSq: minDistSq,
        dist: Math.sqrt(minDistSq),
        minStationCellDist,
        nearestStation,
        tieBreaker: rand(),
      });
    }
  }

  // H1: Sort candidate building cells nearest to nearest station first, breaking ties with seeded rand
  candidateBuildingCells.sort((a, b) => a.distSq - b.distSq || a.tieBreaker - b.tieBreaker);

  for (const cell of candidateBuildingCells) {
    if (buildings.length >= MAX_BUILDINGS) break;
    const { r, c, cx, cz, dist, minStationCellDist, nearestStation } = cell;
    if (occupied[r]![c]) continue;

    const isBackThird = cz <= bounds.minZ + bounds.depth / 3;
    const distToCameraTarget = Math.hypot(
      cx - bounds.centerX,
      cz - (bounds.minZ + bounds.depth * 0.4)
    );

    let candidatePool: readonly CityKindInfo[];
    if (minStationCellDist > 5 && LOW_DETAIL_BUILDINGS.length > 0) {
      // P12: every city cell farther than 5 cells from any station uses low-detail buildings (brings tris <= 320k)
      candidatePool = LOW_DETAIL_BUILDINGS;
    } else if (minStationCellDist <= 3) {
      // G3: fill buildings within 3 cells of a station use low-rise pool
      candidatePool = LOW_BUILDINGS;
    } else if (dist <= 6.0) {
      candidatePool = LOW_BUILDINGS;
    } else if (dist <= 14.0) {
      candidatePool = MID_BUILDINGS;
    } else if (isBackThird) {
      // E6: tall tier uses low-detail buildings
      candidatePool = LOW_DETAIL_BUILDINGS;
    } else {
      candidatePool = MID_BUILDINGS;
    }

    if (candidatePool.length === 0) continue;

    // E5: Never adjacent duplicates
    const adjacentVariants = new Set<string>();
    if (r > 0 && placedVariantGrid[r - 1]?.[c]) adjacentVariants.add(placedVariantGrid[r - 1]![c]!);
    if (r + 1 < rows && placedVariantGrid[r + 1]?.[c]) adjacentVariants.add(placedVariantGrid[r + 1]![c]!);
    if (c > 0 && placedVariantGrid[r]?.[c - 1]) adjacentVariants.add(placedVariantGrid[r]![c - 1]!);
    if (c + 1 < cols && placedVariantGrid[r]?.[c + 1]) adjacentVariants.add(placedVariantGrid[r]![c + 1]!);

    let pool: readonly CityKindInfo[] = candidatePool.filter((b) => !adjacentVariants.has(b.name));
    if (pool.length === 0) pool = candidatePool;

    const variant = pool[Math.floor(rand() * pool.length)]!;

    occupied[r]![c] = true;
    placedVariantGrid[r]![c] = variant.name;

    const rotY = Math.floor(rand() * 4) * (Math.PI / 2);
    const sJitter = 0.9 + rand() * 0.2;
    let scaleY = sJitter;

    // G3: fill buildings within 3 cells of a station are capped at 0.7 * that station's height
    if (minStationCellDist <= 3 && nearestStation) {
      const stationH = nearestStation.height ?? 3.0;
      const maxH = 0.7 * stationH;
      if (variant.height * scaleY > maxH) {
        scaleY = maxH / variant.height;
      }
    }

    buildings.push({
      kind: variant.name,
      position: [cx, 0.17, cz],
      rotationY: rotY,
      scale: [sJitter, scaleY, sJitter],
    });
  }

  // 5. Place Trees & Palms (H1: nearest-first up to 180)
  const trees: PlacedInstance[] = [];
  const MAX_TREES = 180;

  interface CandidateTree {
    kind: string;
    position: [number, number, number];
    rotationY: number;
    scale: [number, number, number];
    distSq: number;
    tieBreaker: number;
  }
  const candidateTrees: CandidateTree[] = [];

  // A. Palms along the promenade road (every second cell)
  for (let c = 0; c < cols; c += 2) {
    const px = bounds.minX + (c + 0.5) * cellSize;
    const pz = promenadeZ - 0.5; // On pavement edge along shore
    const palmVariants = ["tree-palm-tall", "tree-palm-bend", "tree-palm-short"];
    const kind = palmVariants[Math.floor(rand() * palmVariants.length)]!;
    const rotY = rand() * Math.PI * 2;
    const sJitter = 0.85 + rand() * 0.3;

    let minDistSq = Infinity;
    for (const s of stations) {
      const dSq = (px - s.position3D[0]) ** 2 + (pz - s.position3D[2]) ** 2;
      if (dSq < minDistSq) minDistSq = dSq;
    }

    candidateTrees.push({
      kind,
      position: [px, 0.17, pz],
      rotationY: rotY,
      scale: [sJitter, sJitter, sJitter],
      distSq: minDistSq,
      tieBreaker: rand(),
    });
  }

  // B. Trees in park cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r]![c] === "park") {
        const px = bounds.minX + (c + 0.5) * cellSize + (rand() - 0.5) * 0.4;
        const pz = bounds.minZ + (r + 0.5) * cellSize + (rand() - 0.5) * 0.4;
        const parkTrees = ["tree-oak", "tree-simple", "tree-pine", "tree-bush"];
        const kind = parkTrees[Math.floor(rand() * parkTrees.length)]!;
        const rotY = rand() * Math.PI * 2;
        const sJitter = 0.8 + rand() * 0.35;

        let minDistSq = Infinity;
        for (const s of stations) {
          const dSq = (px - s.position3D[0]) ** 2 + (pz - s.position3D[2]) ** 2;
          if (dSq < minDistSq) minDistSq = dSq;
        }

        candidateTrees.push({
          kind,
          position: [px, 0.17, pz],
          rotationY: rotY,
          scale: [sJitter, sJitter, sJitter],
          distSq: minDistSq,
          tieBreaker: rand(),
        });
      }
    }
  }

  // C. Street trees on every 3rd street cell along block edges (F5)
  let streetEdgeCellCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r]![c] === "road") {
        const isBlockEdge =
          (r > 0 && cells[r - 1]?.[c] === "building") ||
          (r + 1 < rows && cells[r + 1]?.[c] === "building") ||
          (c > 0 && cells[r]?.[c - 1] === "building") ||
          (c + 1 < cols && cells[r]?.[c + 1] === "building");

        if (isBlockEdge) {
          streetEdgeCellCount++;
          if (streetEdgeCellCount % 3 === 0) {
            const px = bounds.minX + (c + 0.5) * cellSize;
            const pz = bounds.minZ + (r + 0.5) * cellSize;
            const streetTrees = ["tree-simple", "tree-oak", "tree-pine"];
            const kind = streetTrees[Math.floor(rand() * streetTrees.length)]!;
            const rotY = rand() * Math.PI * 2;
            const sJitter = 0.75 + rand() * 0.3;

            let minDistSq = Infinity;
            for (const s of stations) {
              const dSq = (px - s.position3D[0]) ** 2 + (pz - s.position3D[2]) ** 2;
              if (dSq < minDistSq) minDistSq = dSq;
            }

            candidateTrees.push({
              kind,
              position: [px, 0.17, pz],
              rotationY: rotY,
              scale: [sJitter, sJitter, sJitter],
              distSq: minDistSq,
              tieBreaker: rand(),
            });
          }
        }
      }
    }
  }

  // H1: Sort candidate trees nearest to nearest station first, fill nearest first up to 180
  candidateTrees.sort((a, b) => a.distSq - b.distSq || a.tieBreaker - b.tieBreaker);
  for (let i = 0; i < Math.min(candidateTrees.length, MAX_TREES); i++) {
    const t = candidateTrees[i]!;
    trees.push({
      kind: t.kind,
      position: t.position,
      rotationY: t.rotationY,
      scale: t.scale,
    });
  }

  // 6. Place Props (Boats, Lamps, Barriers)
  const props: PlacedInstance[] = [];
  const MAX_PROPS = 40;

  // A. Boats in the water band (z > promenadeZ)
  // E4: Boats sit on water only. Every prop-boat cell is a water cell.
  const waterCellList: Array<{ r: number; c: number; cx: number; cz: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r]![c] === "water") {
        const cx = bounds.minX + (c + 0.5) * cellSize;
        const cz = bounds.minZ + (r + 0.5) * cellSize;
        if (cz > promenadeZ + 1.5 && cx > bounds.minX + 3 && cx < bounds.maxX - 3) {
          waterCellList.push({ r, c, cx, cz });
        }
      }
    }
  }

  const numBoats = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < numBoats && waterCellList.length > 0 && props.length < MAX_PROPS; i++) {
    const chosenIdx = Math.floor(rand() * waterCellList.length);
    const chosenCell = waterCellList.splice(chosenIdx, 1)[0]!;
    const boatKinds = ["prop-boat-small", "prop-boat-large"];
    const kind = boatKinds[Math.floor(rand() * boatKinds.length)]!;
    const rotY = (rand() - 0.5) * 0.8;

    props.push({
      kind,
      position: [chosenCell.cx, 0.02, chosenCell.cz],
      rotationY: rotY,
      scale: [1, 1, 1],
    });
  }

  // B. Street lamps along the promenade and road segments
  for (let c = 1; c < cols && props.length < MAX_PROPS; c += 4) {
    const lx = bounds.minX + (c + 0.5) * cellSize;
    const lz = promenadeZ - 0.9;
    const lampKinds = ["prop-light-single", "prop-light-double"];
    const kind = lampKinds[Math.floor(rand() * lampKinds.length)]!;

    props.push({
      kind,
      position: [lx, 0.17, lz],
      rotationY: 0,
      scale: [0.8, 0.8, 0.8],
    });
  }

  // C. Barriers along roads
  for (let c = 3; c < cols && props.length < MAX_PROPS; c += 6) {
    const bx = bounds.minX + (c + 0.5) * cellSize;
    const bz = promenadeZ - 0.2;

    props.push({
      kind: "prop-barrier",
      position: [bx, 0.17, bz],
      rotationY: Math.PI / 2,
      scale: [0.9, 0.9, 0.9],
    });
  }

  return {
    bounds,
    promenadeZ,
    cellGrid: {
      cols,
      rows,
      cellSize,
      cells,
    },
    corridorCells,
    buildings,
    trees,
    props,
    roadSegments,
  };
}
