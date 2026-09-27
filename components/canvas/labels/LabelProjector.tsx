"use client";

import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { MetroVM } from "@/lib/graph/viewModel";
import {
  layoutStageCards,
  type PlacedStageCard,
} from "./layoutStageCards";
import { useViewStore } from "@/lib/store/useViewStore";

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

  // Priority -1: runs after CameraControls update on every frame (§11.4)
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

    // Check if layout needs to run (focusStage, canvas size) (§11.4)
    // Nothing re-lays out on click, hover, mark done, drawer open/close or camera damping.
    const layoutKey = `${focusStage}_${size.width}x${size.height}`;
    if (lastLayoutKey.current !== layoutKey) {
      lastLayoutKey.current = layoutKey;

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
        insets: { left: 16, right: 396, top: 56, bottom: 52 },
      });
      cachedScreenPos.current.clear();
    }

    const placements = cachedPlacements.current;

    // Project each visible card
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
