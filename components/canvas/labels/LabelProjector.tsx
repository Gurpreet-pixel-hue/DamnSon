"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { MetroVM, StationVM } from "@/lib/graph/viewModel";
import { MAX_LABEL_SLOTS } from "./selectLabels";

export interface LabelProjectorProps {
  metro: MetroVM;
  slotsRef: React.RefObject<(HTMLButtonElement | null)[]>;
  selectionRef?: React.RefObject<StationVM[]>;
}

// Pre-allocated scratch vectors to guarantee 0 allocations in useFrame
const scratchVec = new THREE.Vector3();
const scratchCamPos = new THREE.Vector3();
const scratchCamForward = new THREE.Vector3();
const scratchCamToStation = new THREE.Vector3();

export function LabelProjector({ slotsRef, selectionRef }: LabelProjectorProps) {
  const { camera, size } = useThree();

  // Cached matrix elements (16 floats each)
  const cachedWorldMatrix = useRef(new Float32Array(16));
  const cachedProjMatrix = useRef(new Float32Array(16));
  const cachedWidth = useRef(0);
  const cachedHeight = useRef(0);
  const cachedStations = useRef<StationVM[] | null>(null);

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

    const stations = selectionRef?.current ?? [];
    const stationsChanged = stations !== cachedStations.current;

    if (!matrixChanged && !sizeChanged && !stationsChanged) {
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
    if (stationsChanged) {
      cachedStations.current = stations;
    }

    const slots = slotsRef.current;
    if (!slots) return;

    camera.getWorldPosition(scratchCamPos);
    camera.getWorldDirection(scratchCamForward);

    const halfW = size.width / 2;
    const halfH = size.height / 2;
    const count = stations.length;

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

      scratchVec.set(
        station.position3D[0],
        station.position3D[1] + 1.8,
        station.position3D[2]
      );

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

      // Write transform BEFORE setting visibility to visible
      el.style.transform = `translate3d(${Math.round(screenX)}px, ${Math.round(screenY)}px, 0) translate(-50%, -50%)`;
      el.style.visibility = "visible";
    }
  });

  return null;
}
