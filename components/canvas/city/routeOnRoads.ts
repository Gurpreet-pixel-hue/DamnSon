/**
 * routeOnRoads: Routes follow the streets (§11.5)
 * (Pure TypeScript, deterministic, no THREE imports in core derivations)
 *
 * Replaces Bézier curves with paths routed on the road network:
 * - BFS on the road graph between station plazas
 * - Polyline in the left lane (0.18 from centerline) with corners rounded at r = 0.3
 * - Multi-route offset of 0.12 per route sharing a cell
 * - Flat ribbon of width 0.35 at y = 0.195 (HEIGHTS.routeLane)
 * - Polyline sampled for pulses
 */

import { HEIGHTS } from "../heights";
import type { RoadCell, RoadGraph } from "./roadGraph";

export interface RouteTrackInput {
  id: string;
  from: string;
  to: string;
}

export interface RouteStationInput {
  id: string;
  position3D: [number, number, number];
}

export interface RouteOnRoad {
  trackId: string;
  fromStationId: string;
  toStationId: string;
  roadCells: RoadCell[];
  polyline: [number, number, number][]; // 3D points at y = HEIGHTS.routeLane (0.195)
  length: number;
  // Ribbon mesh buffers for a flat ribbon of width 0.35
  ribbonPositions: Float32Array;
  ribbonNormals: Float32Array;
  ribbonIndices: Uint32Array;
}

export interface ComputeRoutesOnRoadsOptions {
  tracks: RouteTrackInput[];
  stations: RouteStationInput[];
  roadGraph: RoadGraph;
  cellSize: number;
}

/**
 * Finds candidate road cells adjacent to a station plaza (perimeter at sr ± 2, sc ± 2).
 */
function findStationAdjacentRoadCells(
  station: RouteStationInput,
  roadGraph: RoadGraph,
  cellSize: number
): RoadCell[] {
  const [sx, , sz] = station.position3D;
  const adjacent: Array<{ cell: RoadCell; distSq: number }> = [];

  for (const cell of roadGraph.roadCells) {
    const dx = cell.position[0] - sx;
    const dz = cell.position[2] - sz;
    const distSq = dx * dx + dz * dz;
    // Station plaza radius is ~1.6, perimeter road cells are within ~1.6 to 4.0 units
    if (distSq >= (cellSize * 0.9) ** 2 && distSq <= (cellSize * 3.0) ** 2) {
      adjacent.push({ cell, distSq });
    }
  }

  adjacent.sort((a, b) => a.distSq - b.distSq);
  return adjacent.map((a) => a.cell);
}

/**
 * BFS shortest path on 4-connected road cells from startCell to target cells.
 */
function bfsRoadPath(
  startCell: RoadCell,
  targetCells: Set<string>,
  roadCellMap: Map<string, RoadCell>
): RoadCell[] | null {
  const startKey = `${startCell.r},${startCell.c}`;
  if (targetCells.has(startKey)) return [startCell];

  const queue: RoadCell[] = [startCell];
  const cameFrom = new Map<string, RoadCell>();
  const visited = new Set<string>([startKey]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const curKey = `${current.r},${current.c}`;

    if (targetCells.has(curKey)) {
      // Reconstruct path
      const path: RoadCell[] = [current];
      let curr = current;
      while (cameFrom.has(`${curr.r},${curr.c}`)) {
        curr = cameFrom.get(`${curr.r},${curr.c}`)!;
        path.unshift(curr);
      }
      return path;
    }

    const deltas: Array<[number, number, keyof RoadCell["neighbours"]]> = [
      [-1, 0, "north"],
      [1, 0, "south"],
      [0, 1, "east"],
      [0, -1, "west"],
    ];

    for (const [dr, dc, dir] of deltas) {
      if (!current.neighbours[dir]) continue;
      const nr = current.r + dr;
      const nc = current.c + dc;
      const nKey = `${nr},${nc}`;

      if (!visited.has(nKey) && roadCellMap.has(nKey)) {
        visited.add(nKey);
        const nextCell = roadCellMap.get(nKey)!;
        cameFrom.set(nKey, current);
        queue.push(nextCell);
      }
    }
  }

  return null;
}

/**
 * Computes routes on roads for all given tracks.
 */
export function computeRoutesOnRoads(
  options: ComputeRoutesOnRoadsOptions
): Map<string, RouteOnRoad> {
  const { tracks, stations, roadGraph, cellSize } = options;
  const stationMap = new Map(stations.map((s) => [s.id, s]));
  const results = new Map<string, RouteOnRoad>();

  // Map to track how many routes visit each cell (for multi-route offset)
  const cellRouteCount = new Map<string, number>();

  // 1. Compute cell paths for all tracks
  const trackPaths: Array<{
    track: RouteTrackInput;
    fromStation: RouteStationInput;
    toStation: RouteStationInput;
    cells: RoadCell[];
  }> = [];

  for (const track of tracks) {
    const fromStation = stationMap.get(track.from);
    const toStation = stationMap.get(track.to);
    if (!fromStation || !toStation) continue;

    const fromRoads = findStationAdjacentRoadCells(fromStation, roadGraph, cellSize);
    const toRoads = findStationAdjacentRoadCells(toStation, roadGraph, cellSize);

    if (fromRoads.length === 0 || toRoads.length === 0) continue;

    const targetSet = new Set(toRoads.map((c) => `${c.r},${c.c}`));
    let bestPath: RoadCell[] | null = null;

    // Pick path from the closest candidate road cells
    for (const start of fromRoads.slice(0, 3)) {
      const path = bfsRoadPath(start, targetSet, roadGraph.roadCellMap);
      if (path && (!bestPath || path.length < bestPath.length)) {
        bestPath = path;
      }
    }

    if (bestPath && bestPath.length > 0) {
      trackPaths.push({
        track,
        fromStation,
        toStation,
        cells: bestPath,
      });

      for (const cell of bestPath) {
        const key = `${cell.r},${cell.c}`;
        cellRouteCount.set(key, (cellRouteCount.get(key) || 0) + 1);
      }
    }
  }

  // 2. Build polylines and ribbon geometry for each track
  const cellRouteIndex = new Map<string, number>();

  for (const item of trackPaths) {
    const { track, fromStation, toStation, cells } = item;
    const polyline: [number, number, number][] = [];

    // Start at fromStation plaza perimeter towards first road cell
    const pStart = fromStation.position3D;
    const pEnd = toStation.position3D;

    // Cell center points with left lane offset and multi-route offset
    const waypointList: Array<{ x: number; z: number }> = [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      const key = `${cell.r},${cell.c}`;
      const routeIdx = cellRouteIndex.get(key) || 0;
      cellRouteIndex.set(key, routeIdx + 1);

      // Determine heading at this cell
      let dx = 0;
      let dz = 0;
      if (i < cells.length - 1) {
        const next = cells[i + 1]!;
        dx = next.position[0] - cell.position[0];
        dz = next.position[2] - cell.position[2];
      } else if (i > 0) {
        const prev = cells[i - 1]!;
        dx = cell.position[0] - prev.position[0];
        dz = cell.position[2] - prev.position[2];
      } else {
        dx = pEnd[0] - pStart[0];
        dz = pEnd[2] - pStart[2];
      }

      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;

      // Keep-left offset: left normal is (uz, -ux)
      // Base left lane offset = 0.18; multi-route offset = 0.12 * routeIdx
      const totalOffset = 0.18 + (routeIdx > 0 ? (routeIdx % 2 === 1 ? 0.12 * Math.ceil(routeIdx / 2) : -0.12 * (routeIdx / 2)) : 0);
      const nx = uz * totalOffset;
      const nz = -ux * totalOffset;

      waypointList.push({
        x: cell.position[0] + nx,
        z: cell.position[2] + nz,
      });
    }

    // Connect fromStation to first waypoint
    if (waypointList.length > 0) {
      const firstWp = waypointList[0]!;
      const dirX = firstWp.x - pStart[0];
      const dirZ = firstWp.z - pStart[2];
      const dLen = Math.hypot(dirX, dirZ) || 1;
      // Start at station plaza edge (radius ~1.4)
      polyline.push([pStart[0] + (dirX / dLen) * 1.4, HEIGHTS.routeLane, pStart[2] + (dirZ / dLen) * 1.4]);
    }

    // Round corners at r = 0.3
    const CORNER_RADIUS = 0.3;
    for (let i = 0; i < waypointList.length; i++) {
      const curr = waypointList[i]!;

      if (i > 0 && i < waypointList.length - 1) {
        const prev = waypointList[i - 1]!;
        const next = waypointList[i + 1]!;

        const vInX = curr.x - prev.x;
        const vInZ = curr.z - prev.z;
        const lenIn = Math.hypot(vInX, vInZ);

        const vOutX = next.x - curr.x;
        const vOutZ = next.z - curr.z;
        const lenOut = Math.hypot(vOutX, vOutZ);

        // If turn detected (directions differ)
        const dot = (vInX * vOutX + vInZ * vOutZ) / ((lenIn * lenOut) || 1);
        if (dot < 0.98 && lenIn > 0.4 && lenOut > 0.4) {
          const rClamped = Math.min(CORNER_RADIUS, lenIn * 0.4, lenOut * 0.4);
          const pA: [number, number] = [curr.x - (vInX / lenIn) * rClamped, curr.z - (vInZ / lenIn) * rClamped];
          const pB: [number, number] = [curr.x + (vOutX / lenOut) * rClamped, curr.z + (vOutZ / lenOut) * rClamped];

          // Sample quadratic Bezier through corner
          const SAMPLES = 4;
          for (let s = 0; s <= SAMPLES; s++) {
            const t = s / SAMPLES;
            const mt = 1 - t;
            const bx = mt * mt * pA[0] + 2 * mt * t * curr.x + t * t * pB[0];
            const bz = mt * mt * pA[1] + 2 * mt * t * curr.z + t * t * pB[1];
            polyline.push([bx, HEIGHTS.routeLane, bz]);
          }
          continue;
        }
      }

      polyline.push([curr.x, HEIGHTS.routeLane, curr.z]);
    }

    // Connect last waypoint to toStation plaza edge
    if (waypointList.length > 0) {
      const lastWp = waypointList[waypointList.length - 1]!;
      const dirX = pEnd[0] - lastWp.x;
      const dirZ = pEnd[2] - lastWp.z;
      const dLen = Math.hypot(dirX, dirZ) || 1;
      polyline.push([pEnd[0] - (dirX / dLen) * 1.4, HEIGHTS.routeLane, pEnd[2] - (dirZ / dLen) * 1.4]);
    }

    // 3. Compute total polyline length
    let totalLength = 0;
    for (let i = 1; i < polyline.length; i++) {
      const p1 = polyline[i - 1]!;
      const p2 = polyline[i]!;
      totalLength += Math.hypot(p2[0] - p1[0], p2[2] - p1[2]);
    }

    // 4. Generate 0.35-wide flat ribbon geometry buffers at y = HEIGHTS.routeLane
    const RIBBON_HALF_WIDTH = 0.35 / 2;
    const numPoints = polyline.length;
    const vertexCount = numPoints * 2;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const indexCount = Math.max(0, (numPoints - 1) * 6);
    const indices = new Uint32Array(indexCount);

    for (let i = 0; i < numPoints; i++) {
      const curr = polyline[i]!;
      let tx = 0;
      let tz = 0;

      if (i < numPoints - 1) {
        const next = polyline[i + 1]!;
        tx += next[0] - curr[0];
        tz += next[2] - curr[2];
      }
      if (i > 0) {
        const prev = polyline[i - 1]!;
        tx += curr[0] - prev[0];
        tz += curr[2] - prev[2];
      }

      const tLen = Math.hypot(tx, tz) || 1;
      const ux = tx / tLen;
      const uz = tz / tLen;

      // Normal perpendicular in XZ plane: (uz, -ux)
      const nx = uz * RIBBON_HALF_WIDTH;
      const nz = -ux * RIBBON_HALF_WIDTH;

      const idxLeft = i * 2;
      const idxRight = i * 2 + 1;

      // Left vertex
      positions[idxLeft * 3] = curr[0] + nx;
      positions[idxLeft * 3 + 1] = HEIGHTS.routeLane;
      positions[idxLeft * 3 + 2] = curr[2] + nz;
      normals[idxLeft * 3] = 0;
      normals[idxLeft * 3 + 1] = 1;
      normals[idxLeft * 3 + 2] = 0;

      // Right vertex
      positions[idxRight * 3] = curr[0] - nx;
      positions[idxRight * 3 + 1] = HEIGHTS.routeLane;
      positions[idxRight * 3 + 2] = curr[2] - nz;
      normals[idxRight * 3] = 0;
      normals[idxRight * 3 + 1] = 1;
      normals[idxRight * 3 + 2] = 0;

      // Indices (quad between i-1 and i)
      if (i > 0) {
        const quadIdx = (i - 1) * 6;
        const prevLeft = (i - 1) * 2;
        const prevRight = (i - 1) * 2 + 1;

        indices[quadIdx] = prevLeft;
        indices[quadIdx + 1] = prevRight;
        indices[quadIdx + 2] = idxLeft;

        indices[quadIdx + 3] = prevRight;
        indices[quadIdx + 4] = idxRight;
        indices[quadIdx + 5] = idxLeft;
      }
    }

    results.set(track.id, {
      trackId: track.id,
      fromStationId: track.from,
      toStationId: track.to,
      roadCells: cells,
      polyline,
      length: totalLength,
      ribbonPositions: positions,
      ribbonNormals: normals,
      ribbonIndices: indices,
    });
  }

  return results;
}
