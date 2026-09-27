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
  doneSegments: [number, number, number][];
  nextUpSegments: [number, number, number][];
  criticalSegments: [number, number, number][];
  dashedSegments: [number, number, number][];
} {
  const stationMap = new Map<string, StationVM>(
    metro.stations.map((s) => [s.id, s])
  );

  const curves: TrackCurveData[] = [];
  const normalSegments: [number, number, number][] = [];
  const doneSegments: [number, number, number][] = [];
  const nextUpSegments: [number, number, number][] = [];
  const criticalSegments: [number, number, number][] = [];
  const dashedSegments: [number, number, number][] = [];

  for (const track of metro.tracks) {
    const fromStation = stationMap.get(track.from);
    const toStation = stationMap.get(track.to);
    if (!fromStation || !toStation) continue;

    // Connect along road: y = 0.25 above the station plaza level (0.21 + 0.25 = 0.46)
    const p0 = new THREE.Vector3(
      fromStation.position3D[0] + 0.7,
      0.46,
      fromStation.position3D[2]
    );
    const p3 = new THREE.Vector3(
      toStation.position3D[0] - 0.7,
      0.46,
      toStation.position3D[2]
    );

    const deltaX = p3.x - p0.x;
    const p1 = new THREE.Vector3(p0.x + deltaX * 0.4, 0.46, p0.z);
    const p2 = new THREE.Vector3(p0.x + deltaX * 0.6, 0.46, p3.z);

    const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
    const points = curve.getPoints(23); // 24 points
    const length = curve.getLength();

    curves.push({
      track,
      curve,
      points,
      length,
    });

    // Populate segment pairs
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
    } else if (track.critical) {
      criticalSegments.push(...segPairs);
    } else if (track.toAvailable) {
      nextUpSegments.push(...segPairs);
    } else if (fromStation.state === "done" && toStation.state === "done") {
      doneSegments.push(...segPairs);
    } else {
      normalSegments.push(...segPairs);
    }
  }

  return {
    curves,
    normalSegments,
    doneSegments,
    nextUpSegments,
    criticalSegments,
    dashedSegments,
  };
}

export function Tracks({ metro }: TracksProps) {
  const criticalPathOn = useViewStore((s) => s.criticalPathOn);

  const {
    normalSegments,
    doneSegments,
    nextUpSegments,
    criticalSegments,
    dashedSegments,
  } = useMemo(() => computeTrackCurves(metro), [metro]);

  return (
    <group>
      {/* 1. Normal routes (trackNormal #9AA3AD, width 4) */}
      {normalSegments.length > 0 && (
        <Line
          segments
          points={normalSegments}
          color={PALETTE.trackNormal}
          lineWidth={4}
        />
      )}

      {/* 2. Done routes (--cw-done #1E7F3B, width 4) */}
      {doneSegments.length > 0 && (
        <Line
          segments
          points={doneSegments}
          color={PALETTE.done}
          lineWidth={4}
        />
      )}

      {/* 3. Next-up routes (--cw-available #1F63D6, width 5) */}
      {nextUpSegments.length > 0 && (
        <Line
          segments
          points={nextUpSegments}
          color={PALETTE.available}
          lineWidth={5}
        />
      )}

      {/* 4. Critical path routes (only while toggle is on: --cw-critical #D92D20, width 6) */}
      {criticalSegments.length > 0 && (
        <Line
          segments
          points={criticalSegments}
          color={criticalPathOn ? PALETTE.critical : PALETTE.normalTrack}
          lineWidth={criticalPathOn ? 6 : 4}
        />
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
        />
      )}
    </group>
  );
}
