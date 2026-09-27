"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { MetroVM, StationVM } from "@/lib/graph/viewModel";
import {
  MAX_LABEL_SLOTS,
  resolveLabelCollisions,
  type ProjectedStationPoint,
  type ScreenRect,
} from "./selectLabels";
import { deriveStageHeaders } from "../StageHeaders";

export interface LabelProjectorProps {
  metro: MetroVM;
  slotsRef: React.RefObject<(HTMLButtonElement | null)[]>;
  pinSlotsRef: React.RefObject<(HTMLButtonElement | null)[]>;
  selectionRef?: React.RefObject<StationVM[]>;
}

// Pre-allocated scratch vectors to guarantee 0 allocations in useFrame
const scratchVec = new THREE.Vector3();
const scratchCamPos = new THREE.Vector3();
const scratchCamForward = new THREE.Vector3();
const scratchCamToStation = new THREE.Vector3();
const EMPTY_STATIONS: StationVM[] = [];

export function LabelProjector({
  metro,
  slotsRef,
  pinSlotsRef,
  selectionRef,
}: LabelProjectorProps) {
  const { camera, size } = useThree();
  const headers = useMemo(() => deriveStageHeaders(metro), [metro]);

  // Cached matrix elements (16 floats each in Float64Array to preserve exact IEEE-754 precision)
  const cachedWorldMatrix = useRef(new Float64Array(16));
  const cachedProjMatrix = useRef(new Float64Array(16));
  const cachedWidth = useRef(0);
  const cachedHeight = useRef(0);
  const cachedStations = useRef<StationVM[] | null>(null);

  // Development projection counter to verify 0 projections/sec when camera is static
  const devProjectionsRef = useRef(0);
  const devLastSecRef = useRef(0);

  useFrame(() => {
    if (process.env.NODE_ENV !== "production") {
      const now = performance.now();
      if (now - devLastSecRef.current >= 1000) {
        if (typeof window !== "undefined") {
          (window as unknown as { __devProjectionsPerSec?: number }).__devProjectionsPerSec =
            devProjectionsRef.current;
        }
        devProjectionsRef.current = 0;
        devLastSecRef.current = now;
      }
    }

    const wm = camera.matrixWorld.elements;
    const pm = camera.projectionMatrix.elements;
    const cwm = cachedWorldMatrix.current;
    const cpm = cachedProjMatrix.current;

    let matrixChanged = false;
    for (let i = 0; i < 16; i++) {
      if (wm[i] !== cwm[i] || pm[i] !== cpm[i]) {
        matrixChanged = true;
        break;
      }
    }

    const sizeChanged =
      size.width !== cachedWidth.current || size.height !== cachedHeight.current;

    const stations = selectionRef?.current ?? EMPTY_STATIONS;
    const stationsChanged = stations !== cachedStations.current;

    if (!matrixChanged && !sizeChanged && !stationsChanged) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      devProjectionsRef.current++;
    }

    // Update caches
    if (matrixChanged) {
      for (let i = 0; i < 16; i++) {
        cwm[i] = wm[i]!;
        cpm[i] = pm[i]!;
      }
    }
    if (sizeChanged) {
      cachedWidth.current = size.width;
      cachedHeight.current = size.height;
    }
    if (stationsChanged) {
      cachedStations.current = stations;
    }

    const slots = slotsRef.current;
    const pinSlots = pinSlotsRef.current;
    if (!slots || !pinSlots) return;

    camera.getWorldPosition(scratchCamPos);
    camera.getWorldDirection(scratchCamForward);

    const halfW = size.width / 2;
    const halfH = size.height / 2;
    const count = stations.length;
    const placedBoxes: { minX: number; maxX: number; minY: number; maxY: number }[] = [];

    const headerBoxes: ScreenRect[] = [];
    for (const h of headers) {
      scratchVec.set(h.x, 0.57, h.z);
      scratchCamToStation.subVectors(scratchVec, scratchCamPos);
      if (scratchCamToStation.dot(scratchCamForward) <= 0) continue;

      scratchVec.project(camera);
      const hScreenX = scratchVec.x * halfW + halfW;
      const hScreenY = -scratchVec.y * halfH + halfH;

      headerBoxes.push({
        minX: hScreenX - 70,
        maxX: hScreenX + 70,
        minY: hScreenY - 16,
        maxY: hScreenY + 16,
      });
    }

    // Project station points (both card anchor at +2.6 and pin anchor at +0.8)
    const projectedMap = new Map<string, ProjectedStationPoint>();
    for (const station of metro.stations) {
      // 1. Card anchor projection
      scratchVec.set(
        station.position3D[0],
        station.position3D[1] + 2.6,
        station.position3D[2]
      );
      scratchCamToStation.subVectors(scratchVec, scratchCamPos);
      if (scratchCamToStation.dot(scratchCamForward) <= 0) continue;

      scratchVec.project(camera);
      const cardX = scratchVec.x * halfW + halfW;
      const cardY = -scratchVec.y * halfH + halfH;

      // 2. Pin anchor projection
      scratchVec.set(
        station.position3D[0],
        station.position3D[1] + 0.8,
        station.position3D[2]
      );
      scratchVec.project(camera);
      const pinX = scratchVec.x * halfW + halfW;
      const pinY = -scratchVec.y * halfH + halfH;

      if (
        cardX >= -40 &&
        cardX <= size.width + 40 &&
        cardY >= -40 &&
        cardY <= size.height + 40
      ) {
        projectedMap.set(station.id, {
          id: station.id,
          title: station.title,
          lane: station.lane,
          layer: station.layer,
          x: cardX,
          y: cardY,
          pinX,
          pinY,
        });
      }
    }

    // Single unified pure collision pass (G1 & G5)
    const placements = resolveLabelCollisions({
      stations,
      projectedPoints: projectedMap,
      stageHeaders: headerBoxes,
      viewport: size,
    });

    // 1. Update Cards
    for (let i = 0; i < MAX_LABEL_SLOTS; i++) {
      const el = slots[i];
      if (!el) continue;

      if (i >= count) {
        el.style.visibility = "hidden";
        continue;
      }

      const station = stations[i];
      if (!station) {
        el.style.visibility = "hidden";
        continue;
      }

      const pl = placements.get(station.id);
      const pt = projectedMap.get(station.id);

      if (pl && pt && (pl.mode === "full" || pl.mode === "compact")) {
        el.dataset.mode = pl.mode;
        el.style.transform = `translate3d(${Math.round(pt.x)}px, ${Math.round(pt.y + pl.yOff)}px, 0) translate(-50%, -50%)`;
        el.style.visibility = "visible";
      } else {
        el.style.visibility = "hidden";
      }
    }

    // 2. Update Pins (pins are shown only for stations without a card; pins intersecting cards are hidden)
    if (pinSlots) {
      const stationCount = metro.stations.length;
      for (let i = 0; i < MAX_LABEL_SLOTS; i++) {
        const pinEl = pinSlots[i];
        if (!pinEl) continue;

        if (i >= stationCount) {
          pinEl.style.visibility = "hidden";
          continue;
        }

        const station = metro.stations[i];
        if (!station) {
          pinEl.style.visibility = "hidden";
          continue;
        }

        const pl = placements.get(station.id);
        const pt = projectedMap.get(station.id);

        if (pl && pt && pl.mode === "pin") {
          const px = pt.pinX ?? pt.x;
          const py = pt.pinY ?? pt.y;
          pinEl.style.transform = `translate3d(${Math.round(px)}px, ${Math.round(py)}px, 0) translate(-50%, -100%)`;
          pinEl.style.visibility = "visible";
        } else {
          pinEl.style.visibility = "hidden";
        }
      }
    }
  });

  return null;
}
