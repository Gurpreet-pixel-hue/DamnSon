"use client";

import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { MetroVM } from "@/lib/graph/viewModel";
import { deriveStageHeaders, MAX_HEADER_SLOTS } from "./StageHeaders";
import { useViewStore } from "@/lib/store/useViewStore";
import { currentStage, getStages } from "@/lib/graph/stages";

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
  const stages = useMemo(() => getStages(metro), [metro]);

  const focusStage = useViewStore((s) => s.focusStage);
  const wholeRouteView = useViewStore((s) => s.wholeRouteView);
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

    // In stage view: show only focused chip and next stage chip (§11.8)
    // In whole-route view: show all chips with screen-space collision culling (§11.8)
    const focusedLayer = focusStage - 1;
    const nextLayer = focusStage < stages.length ? focusStage : -1;
    const currentLayer = currStageNum - 1;

    const projectedChips: ProjectedChip[] = [];

    for (let i = 0; i < count; i++) {
      const h = headers[i];
      if (!h) continue;

      if (!wholeRouteView) {
        // Stage view filter: only focused and next chip
        if (h.layer !== focusedLayer && h.layer !== nextLayer) {
          continue;
        }
      }

      scratchVec.set(h.x, 0.57, h.z);

      scratchCamToHeader.subVectors(scratchVec, scratchCamPos);
      if (scratchCamToHeader.dot(scratchCamForward) <= 0) {
        continue;
      }

      scratchVec.project(camera);

      const screenX = scratchVec.x * halfW + halfW;
      const screenY = -scratchVec.y * halfH + halfH;

      if (
        screenX < -100 ||
        screenX > size.width + 100 ||
        screenY < -100 ||
        screenY > size.height + 100
      ) {
        continue;
      }

      // Safe area bounds
      const safeMinX = 24;
      const safeMaxX = size.width - 24;
      const safeMinY = 56;
      const safeMaxY = size.height - 68;

      const clampedX = Math.max(safeMinX + 70, Math.min(safeMaxX - 70, screenX));
      const clampedY = Math.max(safeMinY + 16, Math.min(safeMaxY - 16, screenY));

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
