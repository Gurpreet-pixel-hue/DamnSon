"use client";

import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { MetroVM } from "@/lib/graph/viewModel";
import { deriveStageHeaders, MAX_HEADER_SLOTS } from "./StageHeaders";
import { SAFE_INSETS } from "./labels/selectLabels";

export interface StageHeaderProjectorProps {
  metro: MetroVM;
  slotsRef: React.RefObject<(HTMLDivElement | null)[]>;
}

const scratchVec = new THREE.Vector3();
const scratchCamPos = new THREE.Vector3();
const scratchCamForward = new THREE.Vector3();
const scratchCamToHeader = new THREE.Vector3();

export function StageHeaderProjector({
  metro,
  slotsRef,
}: StageHeaderProjectorProps) {
  const { camera, size } = useThree();
  const headers = useMemo(() => deriveStageHeaders(metro), [metro]);

  const cachedWorldMatrix = useRef(new Float64Array(16));
  const cachedProjMatrix = useRef(new Float64Array(16));
  const cachedWidth = useRef(0);
  const cachedHeight = useRef(0);

  useFrame(() => {
    const wm = camera.matrixWorld.elements;
    const pm = camera.projectionMatrix.elements;
    const cwm = cachedWorldMatrix.current;
    const cpm = cachedProjMatrix.current;

    let changed =
      size.width !== cachedWidth.current || size.height !== cachedHeight.current;
    if (!changed) {
      for (let i = 0; i < 16; i++) {
        if (wm[i] !== cwm[i] || pm[i] !== cpm[i]) {
          changed = true;
          break;
        }
      }
    }

    if (!changed) return;

    for (let i = 0; i < 16; i++) {
      cwm[i] = wm[i]!;
      cpm[i] = pm[i]!;
    }
    cachedWidth.current = size.width;
    cachedHeight.current = size.height;

    const slots = slotsRef.current;
    if (!slots) return;

    camera.getWorldPosition(scratchCamPos);
    camera.getWorldDirection(scratchCamForward);

    const halfW = size.width / 2;
    const halfH = size.height / 2;
    const count = headers.length;

    for (let i = 0; i < MAX_HEADER_SLOTS; i++) {
      const el = slots[i];
      if (!el) continue;

      if (i >= count) {
        el.style.visibility = "hidden";
        continue;
      }

      const h = headers[i];
      if (!h) {
        el.style.visibility = "hidden";
        continue;
      }

      scratchVec.set(h.x, 0.57, h.z);

      scratchCamToHeader.subVectors(scratchVec, scratchCamPos);
      if (scratchCamToHeader.dot(scratchCamForward) <= 0) {
        el.style.visibility = "hidden";
        continue;
      }

      scratchVec.project(camera);

      const screenX = scratchVec.x * halfW + halfW;
      const screenY = -scratchVec.y * halfH + halfH;

      if (
        screenX < -60 ||
        screenX > size.width + 60 ||
        screenY < -60 ||
        screenY > size.height + 60
      ) {
        el.style.visibility = "hidden";
        continue;
      }

      // Safe area clamping (H2 & P11): left/right 16 px, top 56 px, bottom 52 px
      const safeMinX = SAFE_INSETS.left;
      const safeMaxX = size.width - SAFE_INSETS.right;
      const safeMinY = SAFE_INSETS.top;
      const safeMaxY = size.height - SAFE_INSETS.bottom;

      // Header width is ~140 px (half width 70), height ~32 px (half height 16)
      const clampedX = Math.max(safeMinX + 70, Math.min(safeMaxX - 70, screenX));
      const clampedY = Math.max(safeMinY + 16, Math.min(safeMaxY - 16, screenY));

      el.style.transform = `translate3d(${Math.round(clampedX)}px, ${Math.round(clampedY)}px, 0) translate(-50%, -50%)`;
      el.style.visibility = "visible";
    }
  });

  return null;
}
