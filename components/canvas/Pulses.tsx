"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { MetroVM } from "@/lib/graph/viewModel";
import { computeTrackCurves, type TrackCurveData } from "./Tracks";
import { PALETTE } from "./palette";

interface PulsesProps {
  metro: MetroVM;
}

const _tempObj = new THREE.Object3D();
const MAX_PULSES = 40;
const LUT_SAMPLES = 40;

interface PulseLUT {
  trackId: string;
  points: [number, number, number][];
  phaseOffset: number;
}

export function Pulses({ metro }: PulsesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Filter curves that end at an available station
  const pulseTracks = useMemo(() => {
    const { curves } = computeTrackCurves(metro);
    const available = curves.filter((c) => c.track.toAvailable);
    return available.slice(0, MAX_PULSES);
  }, [metro]);

  // Precomputed Arc-length Lookup Tables (LUT)
  const luts = useMemo<PulseLUT[]>(() => {
    return pulseTracks.map((item: TrackCurveData, idx: number) => {
      const pts: [number, number, number][] = [];
      for (let s = 0; s < LUT_SAMPLES; s++) {
        const u = s / (LUT_SAMPLES - 1);
        const p = item.curve.getPointAt(u);
        pts.push([p.x, p.y, p.z]);
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
      if (!lut) continue;

      const progress = (time * speed + lut.phaseOffset) % 1;
      const indexFloat = progress * (LUT_SAMPLES - 1);
      const i0 = Math.floor(indexFloat);
      const i1 = Math.min(i0 + 1, LUT_SAMPLES - 1);
      const frac = indexFloat - i0;

      const p0 = lut.points[i0];
      const p1 = lut.points[i1];
      if (p0 && p1) {
        const x = p0[0] + frac * (p1[0] - p0[0]);
        const y = p0[1] + frac * (p1[1] - p0[1]);
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
