/**
 * Road Graph Generator for CivicWeave City dioramas
 * (Pure TypeScript, deterministic, no THREE imports per visual-direction §10.2)
 *
 * Constructs connected street grid, selects Kenney road tiles based on 4-neighbourhood,
 * verifies station plaza adjacency, and provides closed keep-left driving loops for cars.
 */

import { ROAD_INSTANCE_Y } from "../heights";

export type RoadTileKind =
  | "road-straight"
  | "road-bend"
  | "road-intersection"
  | "road-crossroad"
  | "road-end";

export interface RoadCell {
  r: number;
  c: number;
  position: [number, number, number];
  tile: RoadTileKind;
  rotationY: number;
  neighbours: {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
  };
}

export interface Waypoint {
  x: number;
  z: number;
}

export interface CarLoop {
  id: string;
  waypoints: Waypoint[];
  length: number;
}

export interface RoadGraph {
  roadCells: RoadCell[];
  roadCellMap: Map<string, RoadCell>;
  carLoops: CarLoop[];
  isConnected: boolean;
  everyStationAdjacent: boolean;
}

export interface BuildRoadGraphOptions {
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    width: number;
    depth: number;
  };
  cellSize: number;
  rows: number;
  cols: number;
  cells: string[][];
  stations: Array<{ id: string; position3D: [number, number, number] }>;
}

/**
 * Determines road tile and Y-rotation based on 4-connected road neighbours.
 *
 * Kenney road tiles convention (with cell aligned to grid):
 * - road-straight: open North (-Z) and South (+Z) at rot=0. Rotate PI/2 for East-West.
 * - road-crossroad: open all 4 sides at rot=0.
 * - road-intersection: open South, East, West (North closed) at rot=0.
 *   - North closed (open S, E, W): rot = 0
 *   - East closed (open W, N, S): rot = Math.PI / 2
 *   - South closed (open N, W, E): rot = Math.PI
 *   - West closed (open E, N, S): rot = 3 * Math.PI / 2
 * - road-bend: open North and East at rot=0.
 *   - North & East open: rot = 0
 *   - East & South open: rot = 3 * Math.PI / 2
 *   - South & West open: rot = Math.PI
 *   - West & North open: rot = Math.PI / 2
 * - road-end: open East at rot=0.
 *   - East open: rot = 0
 *   - North open: rot = Math.PI / 2
 *   - West open: rot = Math.PI
 *   - South open: rot = 3 * Math.PI / 2
 */
export function selectRoadTile(n: {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
}): { tile: RoadTileKind; rotationY: number } | null {
  const count = (n.north ? 1 : 0) + (n.south ? 1 : 0) + (n.east ? 1 : 0) + (n.west ? 1 : 0);

  if (count === 4) {
    return { tile: "road-crossroad", rotationY: 0 };
  }

  if (count === 3) {
    if (!n.north) return { tile: "road-intersection", rotationY: 0 };
    if (!n.east) return { tile: "road-intersection", rotationY: Math.PI / 2 };
    if (!n.south) return { tile: "road-intersection", rotationY: Math.PI };
    return { tile: "road-intersection", rotationY: (3 * Math.PI) / 2 };
  }

  if (count === 2) {
    if (n.north && n.south) return { tile: "road-straight", rotationY: 0 };
    if (n.east && n.west) return { tile: "road-straight", rotationY: Math.PI / 2 };
    if (n.north && n.east) return { tile: "road-bend", rotationY: 0 };
    if (n.east && n.south) return { tile: "road-bend", rotationY: (3 * Math.PI) / 2 };
    if (n.south && n.west) return { tile: "road-bend", rotationY: Math.PI };
    if (n.west && n.north) return { tile: "road-bend", rotationY: Math.PI / 2 };
  }

  if (count === 1) {
    if (n.east) return { tile: "road-end", rotationY: 0 };
    if (n.north) return { tile: "road-end", rotationY: Math.PI / 2 };
    if (n.west) return { tile: "road-end", rotationY: Math.PI };
    if (n.south) return { tile: "road-end", rotationY: (3 * Math.PI) / 2 };
  }

  // Count === 0: isolated cell with no road neighbours -> not placed, no tile-low fallback per §11.5
  return null;
}

/**
 * Builds the road graph, verifies station adjacency and connectivity,
 * and generates closed keep-left car loops.
 */
export function buildRoadGraph(options: BuildRoadGraphOptions): RoadGraph {
  const { bounds, cellSize, rows, cols, cells, stations } = options;

  // 1. Ensure every station plaza touches a road cell
  for (const s of stations) {
    const sc = Math.floor((s.position3D[0] - bounds.minX) / cellSize);
    const sr = Math.floor((s.position3D[2] - bounds.minZ) / cellSize);

    let hasRoadNeighbour = false;
    const candidates: Array<{ r: number; c: number }> = [];

    // Check perimeter around 3x3 plaza: sr ± 2, sc ± 2
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (Math.abs(dr) !== 2 && Math.abs(dc) !== 2) continue;
        const r = sr + dr;
        const c = sc + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          if (cells[r]![c] === "road") {
            hasRoadNeighbour = true;
            break;
          }
          candidates.push({ r, c });
        }
      }
      if (hasRoadNeighbour) break;
    }

    // If no road touches the plaza perimeter, connect candidate straight to nearest street grid line
    if (!hasRoadNeighbour && candidates.length > 0) {
      const chosen = candidates[0]!;
      cells[chosen.r]![chosen.c] = "road";
      // Connect along row to nearest col % 4 === 0 grid line
      const targetC = Math.round(chosen.c / 4) * 4;
      const stepC = targetC > chosen.c ? 1 : -1;
      for (let c = chosen.c; c !== targetC; c += stepC) {
        if (c >= 0 && c < cols) cells[chosen.r]![c] = "road";
      }
      if (targetC >= 0 && targetC < cols) cells[chosen.r]![targetC] = "road";
    }
  }

  // 2. Collect all road cells and determine neighbours
  const roadCells: RoadCell[] = [];
  const roadCellMap = new Map<string, RoadCell>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r]![c] !== "road") continue;

      const north = r > 0 && cells[r - 1]?.[c] === "road";
      const south = r + 1 < rows && cells[r + 1]?.[c] === "road";
      const east = c + 1 < cols && cells[r]?.[c + 1] === "road";
      const west = c > 0 && cells[r]?.[c - 1] === "road";

      const neighbours = { north, south, east, west };
      const tileInfo = selectRoadTile(neighbours);
      if (!tileInfo) {
        // Isolated cell with no road neighbours: do not place per §11.5
        cells[r]![c] = "empty";
        continue;
      }

      const { tile, rotationY } = tileInfo;
      const cx = bounds.minX + (c + 0.5) * cellSize;
      const cz = bounds.minZ + (r + 0.5) * cellSize;

      const cell: RoadCell = {
        r,
        c,
        position: [cx, ROAD_INSTANCE_Y, cz],
        tile,
        rotationY,
        neighbours,
      };

      roadCells.push(cell);
      roadCellMap.set(`${r},${c}`, cell);
    }
  }

  // 3. Connectivity check via BFS on road cells
  let isConnected = true;
  if (roadCells.length > 0) {
    const visited = new Set<string>();
    const queue: RoadCell[] = [roadCells[0]!];
    visited.add(`${roadCells[0]!.r},${roadCells[0]!.c}`);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const deltas = [
        [-1, 0],
        [1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [dr, dc] of deltas) {
        const nr = current.r + dr!;
        const nc = current.c + dc!;
        const key = `${nr},${nc}`;
        if (!visited.has(key) && roadCellMap.has(key)) {
          visited.add(key);
          queue.push(roadCellMap.get(key)!);
        }
      }
    }
    // Consider connected if at least 95% of road cells are part of the giant component
    isConnected = visited.size >= roadCells.length * 0.95;
  }

  // 4. Verify station plaza adjacency
  let everyStationAdjacent = true;
  for (const s of stations) {
    const sc = Math.floor((s.position3D[0] - bounds.minX) / cellSize);
    const sr = Math.floor((s.position3D[2] - bounds.minZ) / cellSize);

    let touchesRoad = false;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (Math.abs(dr) < 2 && Math.abs(dc) < 2) continue; // inside plaza
        const r = sr + dr;
        const c = sc + dc;
        if (roadCellMap.has(`${r},${c}`)) {
          touchesRoad = true;
          break;
        }
      }
      if (touchesRoad) break;
    }
    if (!touchesRoad) {
      everyStationAdjacent = false;
      break;
    }
  }

  // 5. Generate Keep-Left Car Loops around Grid Blocks (§10.2, §10.3)
  // Grid streets run every 4 cells: r = 0, 4, 8, ... and c = 0, 4, 8, ...
  // Surrounding each block (r to r+4, c to c+4) is a closed 4-sided road rectangle.
  // Driving clockwise around the block keeps traffic on the LEFT side of the road!
  const carLoops: CarLoop[] = [];
  const LANE_OFFSET = 0.38; // Keep-left lane offset (units from center)

  for (let r = 0; r + 4 < rows; r += 4) {
    for (let c = 0; c + 4 < cols; c += 4) {
      // Check if all 4 corners and connecting edges exist in roadCellMap
      let blockSurrounded = true;

      // Top edge: r, c -> c+4
      for (let ci = c; ci <= c + 4; ci++) {
        if (!roadCellMap.has(`${r},${ci}`)) {
          blockSurrounded = false;
          break;
        }
      }
      // Right edge: r -> r+4, c+4
      if (blockSurrounded) {
        for (let ri = r; ri <= r + 4; ri++) {
          if (!roadCellMap.has(`${ri},${c + 4}`)) {
            blockSurrounded = false;
            break;
          }
        }
      }
      // Bottom edge: r+4, c -> c+4
      if (blockSurrounded) {
        for (let ci = c; ci <= c + 4; ci++) {
          if (!roadCellMap.has(`${r + 4},${ci}`)) {
            blockSurrounded = false;
            break;
          }
        }
      }
      // Left edge: r -> r+4, c
      if (blockSurrounded) {
        for (let ri = r; ri <= r + 4; ri++) {
          if (!roadCellMap.has(`${ri},${c}`)) {
            blockSurrounded = false;
            break;
          }
        }
      }

      if (!blockSurrounded) continue;

      // Build clockwise keep-left waypoints for this block
      // 1. Eastbound along row r: from c to c+4 (Left is North: -Z)
      const waypoints: Waypoint[] = [];
      const zTop = bounds.minZ + (r + 0.5) * cellSize - LANE_OFFSET;
      for (let ci = c; ci < c + 4; ci++) {
        const x = bounds.minX + (ci + 0.5) * cellSize;
        waypoints.push({ x, z: zTop });
      }

      // 2. Southbound along col c+4: from r to r+4 (Left is East: +X)
      const xRight = bounds.minX + (c + 4 + 0.5) * cellSize + LANE_OFFSET;
      for (let ri = r; ri < r + 4; ri++) {
        const z = bounds.minZ + (ri + 0.5) * cellSize;
        waypoints.push({ x: xRight, z });
      }

      // 3. Westbound along row r+4: from c+4 down to c (Left is South: +Z)
      const zBottom = bounds.minZ + (r + 4 + 0.5) * cellSize + LANE_OFFSET;
      for (let ci = c + 4; ci > c; ci--) {
        const x = bounds.minX + (ci + 0.5) * cellSize;
        waypoints.push({ x, z: zBottom });
      }

      // 4. Northbound along col c: from r+4 down to r (Left is West: -X)
      const xLeft = bounds.minX + (c + 0.5) * cellSize - LANE_OFFSET;
      for (let ri = r + 4; ri > r; ri--) {
        const z = bounds.minZ + (ri + 0.5) * cellSize;
        waypoints.push({ x: xLeft, z });
      }

      // Compute total loop length
      let length = 0;
      for (let i = 0; i < waypoints.length; i++) {
        const p1 = waypoints[i]!;
        const p2 = waypoints[(i + 1) % waypoints.length]!;
        length += Math.hypot(p2.x - p1.x, p2.z - p1.z);
      }

      if (waypoints.length >= 8 && length > 0) {
        carLoops.push({
          id: `loop-${r}-${c}`,
          waypoints,
          length,
        });
      }
    }
  }

  return {
    roadCells,
    roadCellMap,
    carLoops,
    isConnected,
    everyStationAdjacent,
  };
}
