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
  TALL_BUILDINGS,
  type CityKindInfo,
} from "./cityKinds";

export interface StationLocation {
  id: string;
  position3D: [number, number, number];
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

/**
 * Distance squared from point to line segment
 */
function distSqToSegment(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number {
  const l2 = (x2 - x1) ** 2 + (z2 - z1) ** 2;
  if (l2 === 0) return (px - x1) ** 2 + (pz - z1) ** 2;
  let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (px - (x1 + t * (x2 - x1))) ** 2 + (pz - (z1 + t * (z2 - z1))) ** 2;
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

  // Station bounds plus 14-unit margin on every side, rounded up to 7-unit blocks
  const rawWidth = maxX - minX + 28;
  const rawDepth = maxZ - minZ + 28;

  const width = Math.ceil(rawWidth / 7) * 7;
  const depth = Math.ceil(rawDepth / 7) * 7;

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

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

  // 1. Sample track curves into discrete points and line segments
  const stationMap = new Map(stations.map((s) => [s.id, s.position3D]));
  const sampledSegments: Array<{ x1: number; z1: number; x2: number; z2: number }> = [];
  const roadSegments: Array<{ from: [number, number]; to: [number, number] }> = [];

  for (const t of tracks) {
    const pStart = stationMap.get(t.from);
    const pEnd = stationMap.get(t.to);
    if (!pStart || !pEnd) continue;

    const p0: [number, number] = [pStart[0] + 0.7, pStart[2]];
    const p3: [number, number] = [pEnd[0] - 0.7, pEnd[2]];
    const dx = p3[0] - p0[0];
    const p1: [number, number] = [p0[0] + dx * 0.4, p0[1]];
    const p2: [number, number] = [p0[0] + dx * 0.6, p3[1]];

    let prev = p0;
    const SAMPLES = 12;
    for (let i = 1; i <= SAMPLES; i++) {
      const curr = cubicBezierPoint(p0, p1, p2, p3, i / SAMPLES);
      sampledSegments.push({
        x1: prev[0],
        z1: prev[1],
        x2: curr[0],
        z2: curr[1],
      });
      roadSegments.push({ from: prev, to: curr });
      prev = curr;
    }
  }

  // Add promenade road segment
  roadSegments.push({
    from: [bounds.minX, promenadeZ],
    to: [bounds.maxX, promenadeZ],
  });

  // 2. Classify Grid Cells
  // Cells array: cells[r][c]
  const cells: CellType[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => "building" as CellType)
  );

  const occupied = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false)
  );

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

      // Plaza: within 1.6 units of any station centre
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

      // Road: within 0.9 units of any sampled track curve, or on the promenade
      let isRoad = false;
      if (Math.abs(cz - promenadeZ) <= 0.9) {
        isRoad = true;
      } else {
        for (const seg of sampledSegments) {
          if (distSqToSegment(cx, cz, seg.x1, seg.z1, seg.x2, seg.z2) <= 0.9 * 0.9) {
            isRoad = true;
            break;
          }
        }
      }

      if (isRoad) {
        cells[r]![c] = "road";
        continue;
      }

      freeCellIndices.push({ r, c, x: cx, z: cz });
    }
  }

  // 3. Park clusters: seeded clusters, about 8% of free cells
  const parkTargetCount = Math.floor(freeCellIndices.length * 0.08);
  const numClusters = Math.max(1, Math.min(5, Math.floor(parkTargetCount / 4)));
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

  // 4. Place Buildings
  const buildings: PlacedInstance[] = [];
  const MAX_BUILDINGS = 260;

  for (let r = 0; r < rows && buildings.length < MAX_BUILDINGS; r++) {
    for (let c = 0; c < cols && buildings.length < MAX_BUILDINGS; c++) {
      if (cells[r]![c] !== "building" || occupied[r]![c]) continue;

      const cx = bounds.minX + (c + 0.5) * cellSize;
      const cz = bounds.minZ + (r + 0.5) * cellSize;

      // Distance to nearest station determines tier
      let minDistSq = Infinity;
      for (const s of stations) {
        const dSq = (cx - s.position3D[0]) ** 2 + (cz - s.position3D[2]) ** 2;
        if (dSq < minDistSq) minDistSq = dSq;
      }
      const dist = Math.sqrt(minDistSq);

      let candidatePool: readonly CityKindInfo[];
      if (dist < 5.0) {
        candidatePool = LOW_BUILDINGS;
      } else if (dist <= 12.0) {
        candidatePool = MID_BUILDINGS;
      } else {
        candidatePool = TALL_BUILDINGS;
      }

      if (candidatePool.length === 0) continue;

      const variant = candidatePool[Math.floor(rand() * candidatePool.length)]!;

      // Amendment D3: Check 2x2 vs 1x1 footprint
      if (variant.footprint === "2x2") {
        // Must check that all 4 cells are building cells and free
        const canPlace2x2 =
          r + 1 < rows &&
          c + 1 < cols &&
          cells[r]![c] === "building" &&
          cells[r]![c + 1] === "building" &&
          cells[r + 1]![c] === "building" &&
          cells[r + 1]![c + 1] === "building" &&
          !occupied[r]![c] &&
          !occupied[r]![c + 1] &&
          !occupied[r + 1]![c] &&
          !occupied[r + 1]![c + 1];

        if (canPlace2x2) {
          occupied[r]![c] = true;
          occupied[r]![c + 1] = true;
          occupied[r + 1]![c] = true;
          occupied[r + 1]![c + 1] = true;

          const posX = bounds.minX + (c + 1.0) * cellSize;
          const posZ = bounds.minZ + (r + 1.0) * cellSize;
          const rotY = Math.floor(rand() * 4) * (Math.PI / 2);
          const sJitter = 0.9 + rand() * 0.2;

          buildings.push({
            kind: variant.name,
            position: [posX, 0, posZ],
            rotationY: rotY,
            scale: [sJitter, sJitter, sJitter],
          });
          continue;
        }
      }

      // 1x1 placement (or fallback if 2x2 failed)
      occupied[r]![c] = true;
      const fallback1x1 =
        candidatePool.find((b) => b.footprint === "1x1") || candidatePool[0]!;

      const rotY = Math.floor(rand() * 4) * (Math.PI / 2);
      const sJitter = 0.9 + rand() * 0.2;

      buildings.push({
        kind: fallback1x1.name,
        position: [cx, 0, cz],
        rotationY: rotY,
        scale: [sJitter, sJitter, sJitter],
      });
    }
  }

  // 5. Place Trees & Palms
  const trees: PlacedInstance[] = [];
  const MAX_TREES = 180;

  // A. Palms along the promenade road (every second cell)
  for (let c = 0; c < cols && trees.length < MAX_TREES; c += 2) {
    const px = bounds.minX + (c + 0.5) * cellSize;
    const pz = promenadeZ + 1.0; // Place on pavement facing water
    const palmVariants = ["tree-palm-tall", "tree-palm-bend", "tree-palm-short"];
    const kind = palmVariants[Math.floor(rand() * palmVariants.length)]!;
    const rotY = rand() * Math.PI * 2;
    const sJitter = 0.85 + rand() * 0.3;

    trees.push({
      kind,
      position: [px, 0, pz],
      rotationY: rotY,
      scale: [sJitter, sJitter, sJitter],
    });
  }

  // B. Trees in park cells
  for (let r = 0; r < rows && trees.length < MAX_TREES; r++) {
    for (let c = 0; c < cols && trees.length < MAX_TREES; c++) {
      if (cells[r]![c] === "park") {
        const px = bounds.minX + (c + 0.5) * cellSize + (rand() - 0.5) * 0.4;
        const pz = bounds.minZ + (r + 0.5) * cellSize + (rand() - 0.5) * 0.4;
        const parkTrees = ["tree-oak", "tree-simple", "tree-pine", "tree-bush"];
        const kind = parkTrees[Math.floor(rand() * parkTrees.length)]!;
        const rotY = rand() * Math.PI * 2;
        const sJitter = 0.8 + rand() * 0.35;

        trees.push({
          kind,
          position: [px, 0, pz],
          rotationY: rotY,
          scale: [sJitter, sJitter, sJitter],
        });
      }
    }
  }

  // 6. Place Props (Boats, Lamps, Barriers)
  const props: PlacedInstance[] = [];
  const MAX_PROPS = 40;

  // A. Boats in the water band (z > promenadeZ)
  const numBoats = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < numBoats && props.length < MAX_PROPS; i++) {
    const bx = bounds.minX + 4 + rand() * (bounds.width - 8);
    const bz = promenadeZ + 2.5 + rand() * 6.0;
    const boatKinds = ["prop-boat-small", "prop-boat-large"];
    const kind = boatKinds[Math.floor(rand() * boatKinds.length)]!;
    const rotY = (rand() - 0.5) * 0.8;

    props.push({
      kind,
      position: [bx, -0.05, bz],
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
      position: [lx, 0, lz],
      rotationY: 0,
      scale: [0.8, 0.8, 0.8],
    });
  }

  // C. Barriers along roads
  for (let c = 3; c < cols && props.length < MAX_PROPS; c += 6) {
    const bx = bounds.minX + (c + 0.5) * cellSize;
    const bz = promenadeZ + 0.8;

    props.push({
      kind: "prop-barrier",
      position: [bx, 0, bz],
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
    buildings,
    trees,
    props,
    roadSegments,
  };
}
