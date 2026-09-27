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
import { buildRoadGraph, type RoadGraph } from "./roadGraph";

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
  roads: PlacedInstance[];
  roadGraph: RoadGraph;
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
    const c0 = Math.floor((p0[0] - bounds.minX) / cellSize);
    const r0 = Math.floor((p0[1] - bounds.minZ) / cellSize);
    const c1 = Math.floor((p3[0] - bounds.minX) / cellSize);
    const r1 = Math.floor((p3[1] - bounds.minZ) / cellSize);

    // Manhattan orthogonal path: horizontal then vertical, ensuring 4-connected cells
    const stepC = c1 >= c0 ? 1 : -1;
    for (let c = c0; c !== c1 + stepC; c += stepC) {
      if (r0 >= 0 && r0 < rows && c >= 0 && c < cols) {
        isCorridor[r0]![c] = true;
      }
    }
    const stepR = r1 >= r0 ? 1 : -1;
    for (let r = r0; r !== r1 + stepR; r += stepR) {
      if (r >= 0 && r < rows && c1 >= 0 && c1 < cols) {
        isCorridor[r]![c1] = true;
      }
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
    minNetworkCellDist: number;
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

      // Compute min cell distance to any station or route corridor (A7)
      let minNetworkCellDist = minStationCellDist;
      for (const corr of corridorCells) {
        const cd = Math.max(Math.abs(r - corr.r), Math.abs(c - corr.c));
        if (cd < minNetworkCellDist) {
          minNetworkCellDist = cd;
          if (minNetworkCellDist === 0) break;
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
        minNetworkCellDist,
        nearestStation,
        tieBreaker: rand(),
      });
    }
  }

  // H1: Sort candidate building cells nearest to nearest station first, breaking ties with seeded rand
  candidateBuildingCells.sort((a, b) => a.distSq - b.distSq || a.tieBreaker - b.tieBreaker);

  for (const cell of candidateBuildingCells) {
    if (buildings.length >= MAX_BUILDINGS) break;
    const { r, c, cx, cz, dist, minStationCellDist, minNetworkCellDist, nearestStation } = cell;
    if (occupied[r]![c]) continue;

    const isBackThird = cz <= bounds.minZ + bounds.depth / 3;

    let candidatePool: readonly CityKindInfo[];
    if (minNetworkCellDist > 8 && LOW_DETAIL_BUILDINGS.length > 0) {
      // A7: For cells more than 8 cells away, use low-detail buildings only
      candidatePool = LOW_DETAIL_BUILDINGS;
    } else if (minNetworkCellDist > 3 && LOW_DETAIL_BUILDINGS.length > 0) {
      // A7: Use LOW_DETAIL variants for cells more than 3 cells from any station or route
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

    // A7 & visual-direction §10.1: Stop non-uniform y-squash. Pick lower variants instead.
    if (minStationCellDist <= 3 && nearestStation) {
      const stationH = nearestStation.height ?? 3.0;
      const maxH = 0.7 * stationH;
      const fitting = candidatePool.filter((b) => b.height <= maxH);
      if (fitting.length > 0) {
        candidatePool = fitting;
      } else {
        const sorted = [...candidatePool].sort((a, b) => a.height - b.height);
        candidatePool = [sorted[0]!];
      }
    }

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

    // Buildings face the street: rotation points front at nearest road cell (§10.2)
    let rotY = Math.floor(rand() * 4) * (Math.PI / 2);
    if (r + 1 < rows && cells[r + 1]?.[c] === "road") {
      rotY = 0; // Front faces South (+Z)
    } else if (r > 0 && cells[r - 1]?.[c] === "road") {
      rotY = Math.PI; // Front faces North (-Z)
    } else if (c > 0 && cells[r]?.[c - 1] === "road") {
      rotY = Math.PI / 2; // Front faces West (-X)
    } else if (c + 1 < cols && cells[r]?.[c + 1] === "road") {
      rotY = (3 * Math.PI) / 2; // Front faces East (+X)
    }

    const sJitter = 0.9 + rand() * 0.2;

    // Uniform scale: scale.x === scale.y === scale.z (visual-direction §10.1)
    buildings.push({
      kind: variant.name,
      position: [cx, 0.17, cz],
      rotationY: rotY,
      scale: [sJitter, sJitter, sJitter],
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

  // D. Traffic lights at intersections within 2 cells of a station (§10.2)
  for (const s of stations) {
    if (props.length >= MAX_PROPS) break;
    const sc = Math.floor((s.position3D[0] - bounds.minX) / cellSize);
    const sr = Math.floor((s.position3D[2] - bounds.minZ) / cellSize);
    let added = false;
    for (let dr = -2; dr <= 2 && !added; dr++) {
      for (let dc = -2; dc <= 2 && !added; dc++) {
        const r = sr + dr;
        const c = sc + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols && r % 4 === 0 && c % 4 === 0) {
          const tx = bounds.minX + (c + 0.5) * cellSize + 0.6;
          const tz = bounds.minZ + (r + 0.5) * cellSize + 0.6;
          props.push({
            kind: "prop-traffic-light",
            position: [tx, 0.17, tz],
            rotationY: 0,
            scale: [0.9, 0.9, 0.9],
          });
          added = true;
        }
      }
    }
  }

  // 7. Build road graph and road tile instances (§10.2)
  const roadGraph = buildRoadGraph({
    bounds,
    cellSize,
    rows,
    cols,
    cells,
    stations,
  });

  const roads: PlacedInstance[] = roadGraph.roadCells.map((rc) => ({
    kind: rc.tile,
    position: rc.position,
    rotationY: rc.rotationY,
    scale: [cellSize, 1, cellSize],
  }));

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
    roads,
    roadGraph,
    roadSegments,
  };
}
