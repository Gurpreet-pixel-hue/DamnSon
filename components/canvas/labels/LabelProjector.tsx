"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { MetroVM, StationVM } from "@/lib/graph/viewModel";
import {
  MAX_LABEL_SLOTS,
  SAFE_INSETS,
  resolveLabelCollisions,
  type ProjectedStationPoint,
  type ScreenRect,
  type PlacedLabel,
} from "./selectLabels";
import { deriveStageHeaders } from "../StageHeaders";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";

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

  // Cached line elements for 0-allocation leader line updates
  const lineEls = useRef<(SVGLineElement | null)[]>([]);

  // Development projection counter to verify 0 projections/sec when camera is static
  const devProjectionsRef = useRef(0);
  const devLastSecRef = useRef(0);

  // Cached placements for 250ms still-camera stability and slot hysteresis (§10.6)
  const cachedPlacements = useRef<Map<string, PlacedLabel>>(new Map());
  const cachedLabelMode = useRef<string>("key_steps");
  const cachedSelectedId = useRef<string | null>(null);
  const cameraSettledRef = useRef(false);
  const stillTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (stillTimeoutRef.current) clearTimeout(stillTimeoutRef.current);
    };
  }, []);

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
    const settled = cameraSettledRef.current;

    if (!matrixChanged && !sizeChanged && !stationsChanged && !settled) {
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
      // Camera is moving: schedule collision re-evaluation 250ms after it settles (§10.6)
      if (stillTimeoutRef.current) clearTimeout(stillTimeoutRef.current);
      stillTimeoutRef.current = setTimeout(() => {
        cameraSettledRef.current = true;
      }, 250);
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

    const headerBoxes: ScreenRect[] = [];
    for (const h of headers) {
      scratchVec.set(h.x, 0.57, h.z);
      scratchCamToStation.subVectors(scratchVec, scratchCamPos);
      if (scratchCamToStation.dot(scratchCamForward) <= 0) continue;

      scratchVec.project(camera);
      const hScreenX = scratchVec.x * halfW + halfW;
      const hScreenY = -scratchVec.y * halfH + halfH;

      const safeMinX = SAFE_INSETS.left;
      const safeMaxX = size.width - SAFE_INSETS.right;
      const safeMinY = SAFE_INSETS.top;
      const safeMaxY = size.height - SAFE_INSETS.bottom;

      const clampedHX = Math.max(safeMinX + 70, Math.min(safeMaxX - 70, hScreenX));
      const clampedHY = Math.max(safeMinY + 16, Math.min(safeMaxY - 16, hScreenY));

      headerBoxes.push({
        minX: clampedHX - 70,
        maxX: clampedHX + 70,
        minY: clampedHY - 16,
        maxY: clampedHY + 16,
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

    // Re-run collision resolution only on initial load, size change, station change, mode change, selection change, or after 250ms camera settled
    const currentLabelMode = useViewStore.getState().labelMode;
    const labelModeChanged = currentLabelMode !== cachedLabelMode.current;
    if (labelModeChanged) {
      cachedLabelMode.current = currentLabelMode;
    }

    const currentSelectedId = useTaskStore.getState().selectedStepId;
    const selectedChanged = currentSelectedId !== cachedSelectedId.current;
    if (selectedChanged) {
      cachedSelectedId.current = currentSelectedId;
    }

    const shouldRecomputeSlots =
      cachedPlacements.current.size === 0 ||
      stationsChanged ||
      sizeChanged ||
      labelModeChanged ||
      selectedChanged ||
      settled;

    let placements = cachedPlacements.current;
    if (shouldRecomputeSlots) {
      cameraSettledRef.current = false;
      placements = resolveLabelCollisions({
        stations,
        projectedPoints: projectedMap,
        stageHeaders: headerBoxes,
        viewport: size,
        selectedStepId: currentSelectedId,
        labelMode: currentLabelMode,
        previousPlacements: cachedPlacements.current,
      });
      cachedPlacements.current = placements;
    }

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
        const targetX = Math.round(pt.x + pl.xOff);
        const targetY = Math.round(pt.y + pl.yOff);
        el.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) translate(-50%, -50%)`;
        el.style.visibility = "visible";

        // Update leader line connecting card edge back to station anchor (H2 & H3)
        let lineEl = lineEls.current[i];
        if (!lineEl && el) {
          lineEl = el.querySelector("line");
          lineEls.current[i] = lineEl;
        }
        if (lineEl) {
          const startY = pl.yOff < 0 ? (pl.mode === "full" ? 22 : 14) : (pl.mode === "full" ? -22 : -14);
          lineEl.setAttribute("x1", "0");
          lineEl.setAttribute("y1", String(startY));
          lineEl.setAttribute("x2", String(Math.round(-pl.xOff)));
          lineEl.setAttribute("y2", String(Math.round(-pl.yOff)));
        }
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
