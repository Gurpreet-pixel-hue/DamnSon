"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { MetroVM, StationVM } from "@/lib/graph/viewModel";
import { useViewStore } from "@/lib/store/useViewStore";
import { selectLabels, MAX_LABEL_SLOTS } from "./selectLabels";

export interface LabelProjectorProps {
  metro: MetroVM;
  slotsRef: React.RefObject<(HTMLButtonElement | null)[]>;
}

// Pre-allocated scratch vectors to guarantee 0 allocations in useFrame
const scratchVec = new THREE.Vector3();
const scratchCamPos = new THREE.Vector3();
const scratchCamForward = new THREE.Vector3();
const scratchCamToStation = new THREE.Vector3();

export function LabelProjector({ metro, slotsRef }: LabelProjectorProps) {
  const { camera, size } = useThree();

  const hoveredStepId = useViewStore((s) => s.hoveredStepId);
  const focusedStepId = useViewStore((s) => s.focusedStepId);

  // Cached matrix elements (16 floats each)
  const cachedWorldMatrix = useRef(new Float32Array(16));
  const cachedProjMatrix = useRef(new Float32Array(16));
  const cachedWidth = useRef(0);
  const cachedHeight = useRef(0);
  const cachedMetro = useRef<MetroVM | null>(null);
  const cachedHovered = useRef<string | null>(null);
  const cachedFocused = useRef<string | null>(null);

  // Cache selected stations array when inputs change
  const cachedStations = useRef<StationVM[]>([]);

  useFrame(() => {
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
    const inputChanged =
      metro !== cachedMetro.current ||
      hoveredStepId !== cachedHovered.current ||
      focusedStepId !== cachedFocused.current;

    if (!matrixChanged && !sizeChanged && !inputChanged) {
      return;
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
    if (inputChanged) {
      cachedMetro.current = metro;
      cachedHovered.current = hoveredStepId;
      cachedFocused.current = focusedStepId;
      cachedStations.current = selectLabels(metro, hoveredStepId, focusedStepId);
    }

    const stations = cachedStations.current;
    const slots = slotsRef.current;
    if (!slots) return;

    camera.getWorldPosition(scratchCamPos);
    camera.getWorldDirection(scratchCamForward);

    const halfW = size.width / 2;
    const halfH = size.height / 2;

    for (let i = 0; i < MAX_LABEL_SLOTS; i++) {
      const el = slots[i];
      if (!el) continue;

      const station = stations[i];
      if (!station) {
        el.style.visibility = "hidden";
        continue;
      }

      const [sx, sy, sz] = station.position3D;
      scratchVec.set(sx, sy + 1.8, sz);

      // Check if station is behind camera plane
      scratchCamToStation.subVectors(scratchVec, scratchCamPos);
      if (scratchCamToStation.dot(scratchCamForward) <= 0) {
        el.style.visibility = "hidden";
        continue;
      }

      // Project into NDC (-1 to 1)
      scratchVec.project(camera);

      // Screen space pixels
      const screenX = scratchVec.x * halfW + halfW;
      const screenY = -scratchVec.y * halfH + halfH;

      // Hide if more than 40px outside viewport
      if (
        screenX < -40 ||
        screenX > size.width + 40 ||
        screenY < -40 ||
        screenY > size.height + 40
      ) {
        el.style.visibility = "hidden";
        continue;
      }

      el.style.visibility = "visible";
      el.style.transform = `translate3d(${Math.round(screenX)}px, ${Math.round(screenY)}px, 0) translate(-50%, -50%)`;
    }
  });

  return null;
}
