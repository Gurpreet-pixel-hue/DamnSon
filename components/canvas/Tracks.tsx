"use client";

import { useMemo, useCallback } from "react";
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
 * Supports widthScale (e.g. 0.5 for non-focused stage routes per §11.2).
 */
function buildMergedRibbonGeometry(
  routes: RouteOnRoad[],
  widthScale = 1.0
): THREE.BufferGeometry {
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
    if (widthScale === 1.0) {
      positions.set(r.ribbonPositions, vOffset);
    } else {
      const numVerts = r.ribbonPositions.length / 3;
      for (let i = 0; i < numVerts; i += 2) {
        const leftIdx = i * 3;
        const rightIdx = (i + 1) * 3;
        const midX =
          (r.ribbonPositions[leftIdx]! + r.ribbonPositions[rightIdx]!) * 0.5;
        const midZ =
          (r.ribbonPositions[leftIdx + 2]! + r.ribbonPositions[rightIdx + 2]!) *
          0.5;

        positions[vOffset + leftIdx] =
          midX + (r.ribbonPositions[leftIdx]! - midX) * widthScale;
        positions[vOffset + leftIdx + 1] = r.ribbonPositions[leftIdx + 1]!;
        positions[vOffset + leftIdx + 2] =
          midZ + (r.ribbonPositions[leftIdx + 2]! - midZ) * widthScale;

        positions[vOffset + rightIdx] =
          midX + (r.ribbonPositions[rightIdx]! - midX) * widthScale;
        positions[vOffset + rightIdx + 1] = r.ribbonPositions[rightIdx + 1]!;
        positions[vOffset + rightIdx + 2] =
          midZ + (r.ribbonPositions[rightIdx + 2]! - midZ) * widthScale;
      }
    }

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
  const focusStage = useViewStore((s) => s.focusStage);
  const wholeRouteView = useViewStore((s) => s.wholeRouteView);

  const {
    normalRoutes,
    doneRoutes,
    nextUpRoutes,
    criticalRoutes,
    dashedSegments,
  } = useMemo(() => computeTrackCurves(metro, plan), [metro, plan]);

  const stationMap = useMemo(
    () => new Map(metro.stations.map((s) => [s.id, s])),
    [metro.stations]
  );
  const trackMap = useMemo(
    () => new Map(metro.tracks.map((t) => [t.id, t])),
    [metro.tracks]
  );

  const isFocusRoute = useCallback(
    (route: RouteOnRoad) => {
      if (wholeRouteView) return true;
      const track = trackMap.get(route.trackId);
      if (!track) return false;
      const from = stationMap.get(track.from);
      const to = stationMap.get(track.to);
      return from?.layer === focusStage - 1 || to?.layer === focusStage - 1;
    },
    [wholeRouteView, trackMap, stationMap, focusStage]
  );

  // Split into focused stage routes and dimmed routes (§11.2)
  const normalFocus = useMemo(
    () => normalRoutes.filter(isFocusRoute),
    [normalRoutes, isFocusRoute]
  );
  const normalDimmed = useMemo(
    () => normalRoutes.filter((r) => !isFocusRoute(r)),
    [normalRoutes, isFocusRoute]
  );

  const doneFocus = useMemo(
    () => doneRoutes.filter(isFocusRoute),
    [doneRoutes, isFocusRoute]
  );
  const doneDimmed = useMemo(
    () => doneRoutes.filter((r) => !isFocusRoute(r)),
    [doneRoutes, isFocusRoute]
  );

  const nextUpFocus = useMemo(
    () => nextUpRoutes.filter(isFocusRoute),
    [nextUpRoutes, isFocusRoute]
  );
  const nextUpDimmed = useMemo(
    () => nextUpRoutes.filter((r) => !isFocusRoute(r)),
    [nextUpRoutes, isFocusRoute]
  );

  const criticalFocus = useMemo(
    () => criticalRoutes.filter(isFocusRoute),
    [criticalRoutes, isFocusRoute]
  );
  const criticalDimmed = useMemo(
    () => criticalRoutes.filter((r) => !isFocusRoute(r)),
    [criticalRoutes, isFocusRoute]
  );

  // Full-width geometries (1.0)
  const normalGeom = useMemo(
    () => buildMergedRibbonGeometry(normalFocus, 1.0),
    [normalFocus]
  );
  const doneGeom = useMemo(
    () => buildMergedRibbonGeometry(doneFocus, 1.0),
    [doneFocus]
  );
  const nextUpGeom = useMemo(
    () => buildMergedRibbonGeometry(nextUpFocus, 1.0),
    [nextUpFocus]
  );
  const criticalGeom = useMemo(
    () => buildMergedRibbonGeometry(criticalFocus, 1.0),
    [criticalFocus]
  );

  // 50% width geometries (0.5) for dimmed routes (§11.2)
  const normalDimGeom = useMemo(
    () => buildMergedRibbonGeometry(normalDimmed, 0.5),
    [normalDimmed]
  );
  const doneDimGeom = useMemo(
    () => buildMergedRibbonGeometry(doneDimmed, 0.5),
    [doneDimmed]
  );
  const nextUpDimGeom = useMemo(
    () => buildMergedRibbonGeometry(nextUpDimmed, 0.5),
    [nextUpDimmed]
  );
  const criticalDimGeom = useMemo(
    () => buildMergedRibbonGeometry(criticalDimmed, 0.5),
    [criticalDimmed]
  );

  // Focused Materials (full opacity)
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

  // Dimmed Materials (35% opacity) (§11.2)
  const normalDimMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.trackNormal,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.routeLane.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.routeLane.units,
      }),
    []
  );

  const doneDimMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.done,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.routeLane.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.routeLane.units,
      }),
    []
  );

  const nextUpDimMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.available,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.routeLane.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.routeLane.units,
      }),
    []
  );

  const criticalDimMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: criticalPathOn ? PALETTE.critical : PALETTE.normalTrack,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.routeLane.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.routeLane.units,
      }),
    [criticalPathOn]
  );

  return (
    <group>
      {/* Focused stage routes (full width 0.35, 100% opacity) */}
      {normalFocus.length > 0 && (
        <mesh geometry={normalGeom} material={normalMaterial} />
      )}
      {doneFocus.length > 0 && (
        <mesh geometry={doneGeom} material={doneMaterial} />
      )}
      {nextUpFocus.length > 0 && (
        <mesh geometry={nextUpGeom} material={nextUpMaterial} />
      )}
      {criticalFocus.length > 0 && (
        <mesh geometry={criticalGeom} material={criticalMaterial} />
      )}

      {/* Dimmed routes for other stages (50% width 0.175, 35% opacity) */}
      {normalDimmed.length > 0 && (
        <mesh geometry={normalDimGeom} material={normalDimMaterial} />
      )}
      {doneDimmed.length > 0 && (
        <mesh geometry={doneDimGeom} material={doneDimMaterial} />
      )}
      {nextUpDimmed.length > 0 && (
        <mesh geometry={nextUpDimGeom} material={nextUpDimMaterial} />
      )}
      {criticalDimmed.length > 0 && (
        <mesh geometry={criticalDimGeom} material={criticalDimMaterial} />
      )}

      {/* Dashed routes */}
      {dashedSegments.length > 0 && (
        <Line
          segments
          points={dashedSegments}
          color={PALETTE.undecided}
          lineWidth={wholeRouteView ? 3 : 2}
          transparent={!wholeRouteView}
          opacity={wholeRouteView ? 1 : 0.6}
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
