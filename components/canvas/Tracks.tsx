"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import type { MetroVM, StationVM, TrackVM } from "@/lib/graph/viewModel";
import { PALETTE } from "./palette";
import { useViewStore } from "@/lib/store/useViewStore";

export interface TrackCurveData {
  track: TrackVM;
  curve: THREE.CubicBezierCurve3;
  points: THREE.Vector3[];
  length: number;
}

interface TracksProps {
  metro: MetroVM;
}

export function computeTrackCurves(metro: MetroVM): {
  curves: TrackCurveData[];
  normalSegments: [number, number, number][];
  criticalSegments: [number, number, number][];
  dashedSegments: [number, number, number][];
} {
  const stationMap = new Map<string, StationVM>(
    metro.stations.map((s) => [s.id, s])
  );

  const curves: TrackCurveData[] = [];
  const normalSegments: [number, number, number][] = [];
  const criticalSegments: [number, number, number][] = [];
  const dashedSegments: [number, number, number][] = [];

  for (const track of metro.tracks) {
    const fromStation = stationMap.get(track.from);
    const toStation = stationMap.get(track.to);
    if (!fromStation || !toStation) continue;

    // Connect from station top-front to station top-back
    const p0 = new THREE.Vector3(
      fromStation.position3D[0] + 0.7,
      fromStation.position3D[1] + 0.5,
      fromStation.position3D[2]
    );
    const p3 = new THREE.Vector3(
      toStation.position3D[0] - 0.7,
      toStation.position3D[1] + 0.5,
      toStation.position3D[2]
    );

    const deltaX = p3.x - p0.x;
    const p1 = new THREE.Vector3(p0.x + deltaX * 0.4, p0.y, p0.z);
    const p2 = new THREE.Vector3(p0.x + deltaX * 0.6, p3.y, p3.z);

    const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
    const points = curve.getPoints(23); // exactly 24 sampled points
    const length = curve.getLength();

    curves.push({
      track,
      curve,
      points,
      length,
    });

    // Populate segment pairs for batched <Line segments>
    const segPairs: [number, number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const ptA = points[i];
      const ptB = points[i + 1];
      if (ptA && ptB) {
        segPairs.push([ptA.x, ptA.y, ptA.z], [ptB.x, ptB.y, ptB.z]);
      }
    }

    if (track.dashed) {
      dashedSegments.push(...segPairs);
    } else {
      if (track.critical) {
        criticalSegments.push(...segPairs);
      }
      normalSegments.push(...segPairs);
    }
  }

  // Add online kiosk drop lines to dashed segments
  for (const station of metro.stations) {
    if (station.mode === "online" && station.position3D[1] > 0.05) {
      const [x, y, z] = station.position3D;
      dashedSegments.push([x, y, z], [x, 0.02, z]);
    }
  }

  return {
    curves,
    normalSegments,
    criticalSegments,
    dashedSegments,
  };
}

export function Tracks({ metro }: TracksProps) {
  const criticalPathOn = useViewStore((s) => s.criticalPathOn);

  const { normalSegments, criticalSegments, dashedSegments } = useMemo(
    () => computeTrackCurves(metro),
    [metro]
  );

  return (
    <group>
      {/* 1. Normal tracks (batch 1: #3f3f46, width 3) */}
      {normalSegments.length > 0 && (
        <Line
          segments
          points={normalSegments}
          color={PALETTE.normalTrack}
          lineWidth={3}
        />
      )}

      {/* 2. Critical path tracks (batch 2: #67e8f9, width 5, only when criticalPathOn is true) */}
      {criticalPathOn && criticalSegments.length > 0 && (
        <Line
          segments
          points={criticalSegments}
          color={PALETTE.critical}
          lineWidth={5}
        />
      )}

      {/* 3. Undecided / optional dashed tracks (batch 3: dashed #fbbf24, width 2) */}
      {dashedSegments.length > 0 && (
        <Line
          segments
          points={dashedSegments}
          color={PALETTE.undecided}
          lineWidth={2}
          dashed
          dashScale={2}
          dashSize={0.4}
          gapSize={0.2}
        />
      )}
    </group>
  );
}
