"use client";

import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { MetroVM } from "@/lib/graph/viewModel";
import { deriveStageHeaders, MAX_HEADER_SLOTS } from "./StageHeaders";
import { useViewStore } from "@/lib/store/useViewStore";
import { currentStage } from "@/lib/graph/stages";

export interface StageHeaderProjectorProps {
  metro: MetroVM;
  slotsRef: React.RefObject<(HTMLDivElement | null)[]>;
}

const scratchVec = new THREE.Vector3();
const scratchCamPos = new THREE.Vector3();
const scratchCamForward = new THREE.Vector3();
const scratchCamToHeader = new THREE.Vector3();

interface ProjectedChip {
  index: number;
  layer: number;
  screenX: number;
  screenY: number;
  rect: { minX: number; maxX: number; minY: number; maxY: number };
  priority: number;
  pinnedDirection: "left" | "right" | "top" | "bottom" | "";
}

function chipsOverlap(
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number },
  padding = 6
): boolean {
  return !(
    a.maxX + padding <= b.minX ||
    a.minX - padding >= b.maxX ||
    a.maxY + padding <= b.minY ||
    a.minY - padding >= b.maxY
  );
}

export function StageHeaderProjector({
  metro,
  slotsRef,
}: StageHeaderProjectorProps) {
  const { camera, size } = useThree();
  const headers = useMemo(() => deriveStageHeaders(metro), [metro]);

  const focusStage = useViewStore((s) => s.focusStage);
  const wholeRouteView = useViewStore((s) => s.wholeRouteView);
  const stepperBottomInset = useViewStore((s) => s.stepperBottomInset);
  const currStageNum = useMemo(() => currentStage(metro), [metro]);

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

    // In stage view: show ONLY focused chip (§12.2)
    // In whole-route view: show all chips with screen-space collision culling (§11.8)
    const focusedLayer = focusStage - 1;
    const currentLayer = currStageNum - 1;

    const projectedChips: ProjectedChip[] = [];

    for (let i = 0; i < count; i++) {
      const h = headers[i];
      if (!h) continue;

      if (!wholeRouteView) {
        // Only the focused stage keeps an in-world chip (§12.2)
        if (h.layer !== focusedLayer) {
          continue;
        }
      }

      scratchVec.set(h.x, 0.57, h.z);

      scratchCamToHeader.subVectors(scratchVec, scratchCamPos);
      const isBehind = scratchCamToHeader.dot(scratchCamForward) <= 0;

      let rawScreenX: number;
      let rawScreenY: number;

      if (isBehind) {
        if (!wholeRouteView) {
          // If focused chip is behind camera, pin to bottom window edge
          rawScreenX = halfW;
          rawScreenY = size.height + 100;
        } else {
          continue;
        }
      } else {
        scratchVec.project(camera);
        rawScreenX = scratchVec.x * halfW + halfW;
        rawScreenY = -scratchVec.y * halfH + halfH;
      }

      // Safe area bounds (§12.2)
      const safeMinX = 24 + 70;
      const safeMaxX = size.width - 24 - 70;
      const safeMinY = 56 + 16;
      const bottomInset = stepperBottomInset > 0 ? stepperBottomInset : 68;
      const safeMaxY = size.height - bottomInset - 16;

      let pinnedDirection: "left" | "right" | "top" | "bottom" | "" = "";
      if (rawScreenX < safeMinX) pinnedDirection = "left";
      else if (rawScreenX > safeMaxX) pinnedDirection = "right";
      else if (rawScreenY < safeMinY) pinnedDirection = "top";
      else if (rawScreenY > safeMaxY) pinnedDirection = "bottom";

      const clampedX = Math.max(safeMinX, Math.min(safeMaxX, rawScreenX));
      const clampedY = Math.max(safeMinY, Math.min(safeMaxY, rawScreenY));

      const chipWidth = 140;
      const chipHeight = 32;

      // Priority in whole route view: focused (0) > current (1) > distance from focused
      let priority = 2 + Math.abs(h.layer - focusedLayer);
      if (h.layer === focusedLayer) priority = 0;
      else if (h.layer === currentLayer) priority = 1;

      projectedChips.push({
        index: i,
        layer: h.layer,
        screenX: clampedX,
        screenY: clampedY,
        rect: {
          minX: clampedX - chipWidth / 2,
          maxX: clampedX + chipWidth / 2,
          minY: clampedY - chipHeight / 2,
          maxY: clampedY + chipHeight / 2,
        },
        priority,
        pinnedDirection,
      });
    }

    // Collision culling for whole-route view (§11.8)
    const acceptedSlots = new Set<number>();
    const acceptedRects: ProjectedChip["rect"][] = [];

    // Sort by priority (lowest priority number = highest priority)
    projectedChips.sort((a, b) => a.priority - b.priority);

    for (const chip of projectedChips) {
      if (wholeRouteView) {
        const hasCollision = acceptedRects.some((r) =>
          chipsOverlap(chip.rect, r, 6)
        );
        if (hasCollision) {
          continue; // Cull overlapping chip
        }
      }

      acceptedSlots.add(chip.index);
      acceptedRects.push(chip.rect);

      const el = slots[chip.index];
      if (el) {
        el.dataset.pinned = chip.pinnedDirection;
        el.style.transform = `translate3d(${Math.round(chip.screenX)}px, ${Math.round(chip.screenY)}px, 0) translate(-50%, -50%)`;
        el.style.visibility = "visible";
      }
    }

    // Hide all non-accepted slots
    for (let i = 0; i < MAX_HEADER_SLOTS; i++) {
      if (!acceptedSlots.has(i)) {
        const el = slots[i];
        if (el) el.style.visibility = "hidden";
      }
    }
  });

  return null;
}
