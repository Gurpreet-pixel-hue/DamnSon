"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { MetroVM } from "@/lib/graph/viewModel";
import { computeTrackCurves, type TrackCurveData } from "./Tracks";
import { HEIGHTS, POLYGON_OFFSETS } from "./heights";
import type { CityPlan } from "./city/planCity";

import { useViewStore } from "@/lib/store/useViewStore";

interface PulsesProps {
  metro: MetroVM;
  plan?: CityPlan;
}

const _tempObj = new THREE.Object3D();
const MAX_PULSES = 40;
const LUT_SAMPLES = 40;

interface PulseLUT {
  trackId: string;
  points: [number, number, number][];
  phaseOffset: number;
}

export function Pulses({ metro, plan }: PulsesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const focusStage = useViewStore((s) => s.focusStage);
  const wholeRouteView = useViewStore((s) => s.wholeRouteView);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Filter curves that touch focused stage and end at an available station (§11.2)
  const pulseTracks = useMemo(() => {
    if (wholeRouteView) return [];
    const { curves } = computeTrackCurves(metro, plan);
    const stationMap = new Map(metro.stations.map((s) => [s.id, s]));

    const available = curves.filter((c) => {
      if (!c.track.toAvailable) return false;
      const fromStation = stationMap.get(c.track.from);
      const toStation = stationMap.get(c.track.to);
      const touchesFocus =
        fromStation?.layer === focusStage - 1 ||
        toStation?.layer === focusStage - 1;
      return touchesFocus;
    });
    return available.slice(0, MAX_PULSES);
  }, [metro, plan, focusStage, wholeRouteView]);

  // Precomputed Arc-length Lookup Tables (LUT) along the road polyline
  const luts = useMemo<PulseLUT[]>(() => {
    return pulseTracks.map((item: TrackCurveData, idx: number) => {
      const pts: [number, number, number][] = [];
      const numPts = item.points.length;

      if (numPts >= 2) {
        for (let s = 0; s < LUT_SAMPLES; s++) {
          const u = s / (LUT_SAMPLES - 1);
          const idxFloat = u * (numPts - 1);
          const i0 = Math.floor(idxFloat);
          const i1 = Math.min(i0 + 1, numPts - 1);
          const frac = idxFloat - i0;
          const pA = item.points[i0]!;
          const pB = item.points[i1]!;
          pts.push([
            pA[0] + frac * (pB[0] - pA[0]),
            HEIGHTS.pulses,
            pA[2] + frac * (pB[2] - pA[2]),
          ]);
        }
      }

      return {
        trackId: item.track.id,
        points: pts,
        // Stagger phase offset so pulses don't move in lockstep
        phaseOffset: (idx * 0.37) % 1,
      };
    });
  }, [pulseTracks]);

  const geometry = useMemo(() => new THREE.SphereGeometry(0.14, 16, 16), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#FFFFFF",
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.pulses.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.pulses.units,
      }),
    []
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || prefersReducedMotion || luts.length === 0) return;

    const time = state.clock.getElapsedTime();
    const speed = 0.35; // 0.35 of track length per second

    for (let i = 0; i < luts.length; i++) {
      const lut = luts[i];
      if (!lut || lut.points.length === 0) continue;

      const progress = (time * speed + lut.phaseOffset) % 1;
      const indexFloat = progress * (LUT_SAMPLES - 1);
      const i0 = Math.floor(indexFloat);
      const i1 = Math.min(i0 + 1, LUT_SAMPLES - 1);
      const frac = indexFloat - i0;

      const p0 = lut.points[i0];
      const p1 = lut.points[i1];
      if (p0 && p1) {
        const x = p0[0] + frac * (p1[0] - p0[0]);
        const y = HEIGHTS.pulses; // 0.240 (§11.5)
        const z = p0[2] + frac * (p1[2] - p0[2]);

        _tempObj.position.set(x, y, z);
        _tempObj.scale.set(1, 1, 1);
        _tempObj.updateMatrix();

        mesh.setMatrixAt(i, _tempObj.matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (prefersReducedMotion || luts.length === 0) {
    return null;
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, luts.length]}
    />
  );
}
