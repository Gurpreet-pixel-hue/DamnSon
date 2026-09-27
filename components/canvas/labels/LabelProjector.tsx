"use client";

import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { MetroVM } from "@/lib/graph/viewModel";
import {
  layoutStageCards,
  type PlacedStageCard,
  type ScreenRect,
} from "./layoutStageCards";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { deriveStageHeaders } from "../StageHeaders";

export interface LabelProjectorProps {
  metro: MetroVM;
  cardSlotsRef: React.RefObject<Map<string, HTMLDivElement>>;
  tetherRefs: React.RefObject<Map<string, SVGSVGElement>>;
  tooltipRef?: React.RefObject<HTMLDivElement | null>;
}

const scratchVec = new THREE.Vector3();
const scratchCamPos = new THREE.Vector3();
const scratchCamForward = new THREE.Vector3();
const scratchCamToStation = new THREE.Vector3();

export function LabelProjector({
  metro,
  cardSlotsRef,
  tetherRefs,
  tooltipRef,
}: LabelProjectorProps) {
  const { camera, size } = useThree();
  const focusStage = useViewStore((s) => s.focusStage);
  const wholeRouteView = useViewStore((s) => s.wholeRouteView);
  const hoveredStepId = useViewStore((s) => s.hoveredStepId);
  const stepperBottomInset = useViewStore((s) => s.stepperBottomInset);
  const selectedStepId = useTaskStore((s) => s.selectedStepId);

  const headers = useMemo(() => deriveStageHeaders(metro), [metro]);

  // Stations in focused stage
  const focusedStations = useMemo(() => {
    return metro.stations.filter((s) => s.layer === focusStage - 1);
  }, [metro.stations, focusStage]);

  // When stage has > 8 stations: cards only for available ones (§11.2)
  const visibleStations = useMemo(() => {
    if (focusedStations.length > 8) {
      return focusedStations.filter((s) => s.state === "available");
    }
    return focusedStations;
  }, [focusedStations]);

  const cachedPlacements = useRef<Map<string, PlacedStageCard>>(new Map());
  const cachedScreenPos = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastLayoutKey = useRef<string>("");
  const isGlidingRef = useRef(false);
  const stillFrameCountRef = useRef(0);

  const cachedWorldMatrix = useRef(new Float64Array(16));
  const cachedProjMatrix = useRef(new Float64Array(16));

  // Priority -1: runs after CameraControls update on every frame (§11.4 & §11.8)
  useFrame(() => {
    const cardSlots = cardSlotsRef.current;
    if (!cardSlots) return;

    // In whole route view, hide all cards (§11.3)
    if (wholeRouteView) {
      for (const el of cardSlots.values()) {
        if (el) el.style.visibility = "hidden";
      }
      if (tooltipRef?.current) {
        tooltipRef.current.style.visibility = "hidden";
      }
      return;
    }

    camera.getWorldPosition(scratchCamPos);
    camera.getWorldDirection(scratchCamForward);

    const halfW = size.width / 2;
    const halfH = size.height / 2;

    const wm = camera.matrixWorld.elements;
    const pm = camera.projectionMatrix.elements;
    const cwm = cachedWorldMatrix.current;
    const cpm = cachedProjMatrix.current;

    let cameraMoved = false;
    for (let i = 0; i < 16; i++) {
      if (wm[i] !== cwm[i] || pm[i] !== cpm[i]) {
        cameraMoved = true;
        break;
      }
    }

    if (cameraMoved) {
      for (let i = 0; i < 16; i++) {
        cwm[i] = wm[i]!;
        cpm[i] = pm[i]!;
      }
      isGlidingRef.current = true;
      stillFrameCountRef.current = 0;
    } else {
      stillFrameCountRef.current += 1;
    }

    // Camera has arrived / settled after moving or on stage / size / station change
    const stationKey = visibleStations.map((s) => s.id).join(",");
    const layoutKey = `${focusStage}_${size.width}x${size.height}_${Boolean(selectedStepId)}_${stationKey}`;
    const missingPlacements = visibleStations.some(
      (s) => !cachedPlacements.current.has(s.id)
    );

    const shouldReLayout =
      lastLayoutKey.current !== layoutKey ||
      missingPlacements ||
      (isGlidingRef.current && stillFrameCountRef.current >= 2);

    if (shouldReLayout) {
      lastLayoutKey.current = layoutKey;
      isGlidingRef.current = false;

      // Project stage chips as obstacles (§11.8)
      const chipObstacles: ScreenRect[] = [];
      for (const h of headers) {
        if (!h) continue;
        scratchVec.set(h.x, 0.57, h.z);
        scratchVec.project(camera);
        const sx = scratchVec.x * halfW + halfW;
        const sy = -scratchVec.y * halfH + halfH;
        const clampedX = Math.max(94, Math.min(size.width - 94, sx));
        const clampedY = Math.max(72, Math.min(size.height - 84, sy));
        chipObstacles.push({
          minX: clampedX - 80,
          maxX: clampedX + 80,
          minY: clampedY - 24,
          maxY: clampedY + 24,
        });
      }

      const stationInputs = visibleStations.map((st) => {
        scratchVec.set(
          st.position3D[0],
          st.position3D[1] + 2.6,
          st.position3D[2]
        );
        scratchVec.project(camera);
        const anchorX = scratchVec.x * halfW + halfW;
        const anchorY = -scratchVec.y * halfH + halfH;

        return {
          id: st.id,
          title: st.title,
          anchorX,
          anchorY,
          state: st.state,
          applicability: st.applicability,
        };
      });

      cachedPlacements.current = layoutStageCards({
        stations: stationInputs,
        viewport: size,
        insets: { left: 24, right: 24, top: 56, bottom: stepperBottomInset },
        drawerOpen: Boolean(selectedStepId),
        obstacles: chipObstacles,
      });
      cachedScreenPos.current.clear();
    }

    const placements = cachedPlacements.current;

    // Project each visible card:
    // While camera moves, offsets stay fixed and cards follow their anchors (§11.4)
    for (const station of visibleStations) {
      const el = cardSlots.get(station.id);
      if (!el) continue;

      scratchVec.set(
        station.position3D[0],
        station.position3D[1] + 2.6,
        station.position3D[2]
      );
      scratchCamToStation.subVectors(scratchVec, scratchCamPos);
      if (scratchCamToStation.dot(scratchCamForward) <= 0) {
        el.style.visibility = "hidden";
        continue;
      }

      scratchVec.project(camera);
      const anchorX = scratchVec.x * halfW + halfW;
      const anchorY = -scratchVec.y * halfH + halfH;

      if (
        anchorX < -100 ||
        anchorX > size.width + 100 ||
        anchorY < -100 ||
        anchorY > size.height + 100
      ) {
        el.style.visibility = "hidden";
        continue;
      }

      const pl = placements.get(station.id);
      if (!pl) {
        el.style.visibility = "hidden";
        continue;
      }

      const targetX = Math.round(anchorX + pl.xOff);
      const targetY = Math.round(anchorY + pl.yOff);

      const cached = cachedScreenPos.current.get(station.id);
      if (!cached || cached.x !== targetX || cached.y !== targetY) {
        cachedScreenPos.current.set(station.id, { x: targetX, y: targetY });
        el.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) translate(-50%, -50%)`;

        // Update tether line
        const svg = tetherRefs.current?.get(station.id);
        const line = svg?.querySelector("line");
        if (line) {
          const startY = pl.yOff < 0 ? pl.height / 2 : -pl.height / 2;
          line.setAttribute("x1", "0");
          line.setAttribute("y1", String(startY));
          line.setAttribute("x2", String(Math.round(-pl.xOff)));
          line.setAttribute("y2", String(Math.round(-pl.yOff)));
        }
      }

      el.style.visibility = "visible";
    }

    // Hover tooltip projection (§11.2 & §11.4)
    if (tooltipRef?.current) {
      if (hoveredStepId) {
        const station = metro.stations.find((s) => s.id === hoveredStepId);
        if (station) {
          scratchVec.set(
            station.position3D[0],
            station.position3D[1] + 1.2,
            station.position3D[2]
          );
          scratchCamToStation.subVectors(scratchVec, scratchCamPos);
          if (scratchCamToStation.dot(scratchCamForward) > 0) {
            scratchVec.project(camera);
            const tipX = Math.round(scratchVec.x * halfW + halfW);
            const tipY = Math.round(-scratchVec.y * halfH + halfH);
            tooltipRef.current.style.transform = `translate3d(${tipX}px, ${tipY - 24}px, 0) translate(-50%, -100%)`;
            tooltipRef.current.style.visibility = "visible";
          } else {
            tooltipRef.current.style.visibility = "hidden";
          }
        } else {
          tooltipRef.current.style.visibility = "hidden";
        }
      } else {
        tooltipRef.current.style.visibility = "hidden";
      }
    }
  }, -1);

  return null;
}
