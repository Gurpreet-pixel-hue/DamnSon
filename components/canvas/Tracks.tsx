"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import type { MetroVM, StationVM, TrackVM } from "@/lib/graph/viewModel";
import { PALETTE } from "./palette";
import { POLYGON_OFFSETS } from "./heights";
import { useViewStore } from "@/lib/store/useViewStore";
import { planCity, type CityPlan } from "./city/planCity";
import { computeRoutesOnRoads, type RouteOnRoad } from "./city/routeOnRoads";

export interface TrackCurveData {
  track: TrackVM;
  polyline: [number, number, number][];
  points: [number, number, number][];
  length: number;
}

export interface TracksProps {
  metro: MetroVM;
  plan?: CityPlan;
}

/**
 * Builds merged BufferGeometry from multiple RouteOnRoad ribbon buffers.
 */
function buildMergedRibbonGeometry(routes: RouteOnRoad[]): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  if (routes.length === 0) return geom;

  let totalVerts = 0;
  let totalIndices = 0;
  for (const r of routes) {
    totalVerts += r.ribbonPositions.length;
    totalIndices += r.ribbonIndices.length;
  }

  const positions = new Float32Array(totalVerts);
  const normals = new Float32Array(totalVerts);
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  let vertIndexBase = 0;

  for (const r of routes) {
    positions.set(r.ribbonPositions, vOffset);
    normals.set(r.ribbonNormals, vOffset);
    for (let i = 0; i < r.ribbonIndices.length; i++) {
      indices[iOffset + i] = r.ribbonIndices[i]! + vertIndexBase;
    }
    vOffset += r.ribbonPositions.length;
    iOffset += r.ribbonIndices.length;
    vertIndexBase += r.ribbonPositions.length / 3;
  }

  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  return geom;
}

export function computeTrackCurves(metro: MetroVM, externalPlan?: CityPlan): {
  curves: TrackCurveData[];
  routesMap: Map<string, RouteOnRoad>;
  normalRoutes: RouteOnRoad[];
  doneRoutes: RouteOnRoad[];
  nextUpRoutes: RouteOnRoad[];
  criticalRoutes: RouteOnRoad[];
  dashedRoutes: RouteOnRoad[];
  dashedSegments: [number, number, number][];
} {
  const stationMap = new Map<string, StationVM>(
    metro.stations.map((s) => [s.id, s])
  );

  // Use provided plan or compute fallback plan
  const plan = externalPlan ?? planCity({
    taskId: "routes-plan",
    stations: metro.stations.map((s) => ({ id: s.id, position3D: s.position3D })),
    tracks: metro.tracks.map((t) => ({ id: t.id, from: t.from, to: t.to })),
  });

  const routesMap = computeRoutesOnRoads({
    tracks: metro.tracks,
    stations: metro.stations,
    roadGraph: plan.roadGraph,
    cellSize: plan.cellGrid.cellSize,
  });

  const curves: TrackCurveData[] = [];
  const normalRoutes: RouteOnRoad[] = [];
  const doneRoutes: RouteOnRoad[] = [];
  const nextUpRoutes: RouteOnRoad[] = [];
  const criticalRoutes: RouteOnRoad[] = [];
  const dashedRoutes: RouteOnRoad[] = [];
  const dashedSegments: [number, number, number][] = [];

  for (const track of metro.tracks) {
    const route = routesMap.get(track.id);
    if (!route) continue;

    curves.push({
      track,
      polyline: route.polyline,
      points: route.polyline,
      length: route.length,
    });

    const fromStation = stationMap.get(track.from);

    if (track.dashed) {
      dashedRoutes.push(route);
      for (let i = 0; i < route.polyline.length - 1; i++) {
        const ptA = route.polyline[i]!;
        const ptB = route.polyline[i + 1]!;
        dashedSegments.push([ptA[0], ptA[1], ptA[2]], [ptB[0], ptB[1], ptB[2]]);
      }
    } else if (fromStation?.state === "done") {
      doneRoutes.push(route);
    } else if (track.critical) {
      criticalRoutes.push(route);
    } else if (track.toAvailable) {
      nextUpRoutes.push(route);
    } else {
      normalRoutes.push(route);
    }
  }

  return {
    curves,
    routesMap,
    normalRoutes,
    doneRoutes,
    nextUpRoutes,
    criticalRoutes,
    dashedRoutes,
    dashedSegments,
  };
}

export function Tracks({ metro, plan }: TracksProps) {
  const criticalPathOn = useViewStore((s) => s.criticalPathOn);

  const {
    normalRoutes,
    doneRoutes,
    nextUpRoutes,
    criticalRoutes,
    dashedSegments,
  } = useMemo(() => computeTrackCurves(metro, plan), [metro, plan]);

  // Merged geometries for flat 0.35 ribbons
  const normalGeometry = useMemo(() => buildMergedRibbonGeometry(normalRoutes), [normalRoutes]);
  const doneGeometry = useMemo(() => buildMergedRibbonGeometry(doneRoutes), [doneRoutes]);
  const nextUpGeometry = useMemo(() => buildMergedRibbonGeometry(nextUpRoutes), [nextUpRoutes]);
  const criticalGeometry = useMemo(() => buildMergedRibbonGeometry(criticalRoutes), [criticalRoutes]);

  // Materials with polygonOffset for routeLane
  const normalMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.trackNormal,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.routeLane.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.routeLane.units,
      }),
    []
  );

  const doneMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.done,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.routeLane.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.routeLane.units,
      }),
    []
  );

  const nextUpMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.available,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.routeLane.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.routeLane.units,
      }),
    []
  );

  const criticalMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: criticalPathOn ? PALETTE.critical : PALETTE.normalTrack,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.routeLane.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.routeLane.units,
      }),
    [criticalPathOn]
  );

  return (
    <group>
      {/* 1. Normal routes (trackNormal #9AA3AD, flat ribbon width 0.35) */}
      {normalRoutes.length > 0 && (
        <mesh geometry={normalGeometry} material={normalMaterial} />
      )}

      {/* 2. Done routes (--cw-done #1E7F3B, flat ribbon width 0.35) */}
      {doneRoutes.length > 0 && (
        <mesh geometry={doneGeometry} material={doneMaterial} />
      )}

      {/* 3. Next-up routes (--cw-available #1F63D6, flat ribbon width 0.35) */}
      {nextUpRoutes.length > 0 && (
        <mesh geometry={nextUpGeometry} material={nextUpMaterial} />
      )}

      {/* 4. Critical path routes (only while toggle is on: --cw-critical #D92D20) */}
      {criticalRoutes.length > 0 && (
        <mesh geometry={criticalGeometry} material={criticalMaterial} />
      )}

      {/* 5. Dashed routes (--cw-undecided #B45309, width 3) */}
      {dashedSegments.length > 0 && (
        <Line
          segments
          points={dashedSegments}
          color={PALETTE.undecided}
          lineWidth={3}
          dashed
          dashScale={2}
          dashSize={0.4}
          gapSize={0.2}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSETS.routeLane.factor}
          polygonOffsetUnits={POLYGON_OFFSETS.routeLane.units}
        />
      )}
    </group>
  );
}
