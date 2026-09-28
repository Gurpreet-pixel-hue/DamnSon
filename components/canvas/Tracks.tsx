"use client";

import { useMemo, useCallback, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { MetroVM, StationVM, TrackVM } from "@/lib/graph/viewModel";
import { PALETTE } from "./palette";
import { POLYGON_OFFSETS } from "./heights";
import { useViewStore } from "@/lib/store/useViewStore";
import { planCity, type CityPlan } from "./city/planCity";
import { computeRoutesOnRoads, type RouteOnRoad } from "./city/routeOnRoads";
import { currentStage } from "@/lib/graph/stages";
import { useEntrance } from "./entrance/useEntrance";

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
    dashedRoutes,
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

  const currStageNum = useMemo(() => currentStage(metro), [metro]);

  const isStageViewRoute = useCallback(
    (route: RouteOnRoad) => {
      if (wholeRouteView) return true;
      const track = trackMap.get(route.trackId);
      if (!track) return false;
      const from = stationMap.get(track.from);
      const to = stationMap.get(track.to);
      if (!from || !to) return false;

      const fLayer = focusStage - 1;
      const cLayer = currStageNum - 1;

      // 1. Into or out of the focused stage (§12.4)
      if (from.layer === fLayer || to.layer === fLayer) {
        return true;
      }

      // 2. On the path between current stage and focused stage (§12.4)
      if (fLayer !== cLayer) {
        const minL = Math.min(cLayer, fLayer);
        const maxL = Math.max(cLayer, fLayer);
        if (from.layer >= minL && to.layer <= maxL) {
          return true;
        }
      }

      return false;
    },
    [wholeRouteView, trackMap, stationMap, focusStage, currStageNum]
  );

  // Stage view routes: only into/out of focused stage, plus path from current to focused stage (§12.4).
  // In wholeRouteView, all routes pass isStageViewRoute.
  // Other routes are hidden in stage view (§12.4).
  const normalFocus = useMemo(
    () => normalRoutes.filter(isStageViewRoute),
    [normalRoutes, isStageViewRoute]
  );
  const doneFocus = useMemo(
    () => doneRoutes.filter(isStageViewRoute),
    [doneRoutes, isStageViewRoute]
  );
  const nextUpFocus = useMemo(
    () => nextUpRoutes.filter(isStageViewRoute),
    [nextUpRoutes, isStageViewRoute]
  );
  const criticalFocus = useMemo(
    () => criticalRoutes.filter(isStageViewRoute),
    [criticalRoutes, isStageViewRoute]
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

  // Active dashed segments respecting stage view filter (§12.4)
  const activeDashedSegments = useMemo(() => {
    if (wholeRouteView) return dashedSegments;
    const segs: [number, number, number][] = [];
    for (const route of dashedRoutes) {
      if (isStageViewRoute(route)) {
        for (let i = 0; i < route.polyline.length - 1; i++) {
          const ptA = route.polyline[i]!;
          const ptB = route.polyline[i + 1]!;
          segs.push([ptA[0], ptA[1], ptA[2]], [ptB[0], ptB[1], ptB[2]]);
        }
      }
    }
    return segs;
  }, [wholeRouteView, dashedSegments, dashedRoutes, isStageViewRoute]);

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

  // Route draw animation on entrance (0.4s - 1.2s, §9.4, A13)
  const { isEntering, getRouteProgress } = useEntrance();
  const tracksSettledRef = useRef(false);

  useFrame(() => {
    const entering = isEntering();
    if (!entering) {
      if (!tracksSettledRef.current) {
        tracksSettledRef.current = true;
        normalGeom.setDrawRange(0, Infinity);
        doneGeom.setDrawRange(0, Infinity);
        nextUpGeom.setDrawRange(0, Infinity);
        criticalGeom.setDrawRange(0, Infinity);
      }
      return;
    }

    tracksSettledRef.current = false;
    const progress = getRouteProgress();

    const normalCount = normalGeom.index ? normalGeom.index.count : normalGeom.attributes.position?.count ?? 0;
    const doneCount = doneGeom.index ? doneGeom.index.count : doneGeom.attributes.position?.count ?? 0;
    const nextUpCount = nextUpGeom.index ? nextUpGeom.index.count : nextUpGeom.attributes.position?.count ?? 0;
    const criticalCount = criticalGeom.index ? criticalGeom.index.count : criticalGeom.attributes.position?.count ?? 0;

    normalGeom.setDrawRange(0, Math.floor(normalCount * progress));
    doneGeom.setDrawRange(0, Math.floor(doneCount * progress));
    nextUpGeom.setDrawRange(0, Math.floor(nextUpCount * progress));
    criticalGeom.setDrawRange(0, Math.floor(criticalCount * progress));
  });

  return (
    <group>
      {/* Stage-focused routes (full width 0.35, 100% opacity) */}
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

      {/* Dashed routes (filtered in stage view per §12.4) */}
      {activeDashedSegments.length > 0 && (
        <Line
          segments
          points={activeDashedSegments}
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
