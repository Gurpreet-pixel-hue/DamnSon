"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { CameraControls } from "@react-three/drei";
import type { MetroVM } from "@/lib/graph/viewModel";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { deriveStageHeaders } from "./StageHeaders";
import type { BoardBounds } from "./city/planCity";

interface CameraRigProps {
  metro: MetroVM;
  boardBounds?: BoardBounds;
}

export function CameraRig({ metro, boardBounds }: CameraRigProps) {
  const controlsRef = useRef<CameraControls>(null);
  const focusedStepId = useViewStore((s) => s.focusedStepId);
  const selectedStepId = useTaskStore((s) => s.selectedStepId);
  const initialFittedRef = useRef(false);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // F1: Fog scales with camera distance: on every CameraControls update (0 allocations)
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const updateFog = () => {
      const parentScene = (controls.camera as THREE.Camera & { parent?: { fog?: THREE.Fog } }).parent;
      const fog = parentScene?.fog;
      if (fog && "near" in fog) {
        const dist = controls.distance;
        fog.near = dist * 1.8;
        fog.far = dist * 4.5;
      }
    };

    controls.addEventListener("update", updateFog);
    updateFog();

    return () => {
      controls.removeEventListener("update", updateFog);
    };
  }, []);

  // Compute bounding box encompassing stations, pins, card anchors, and stage headers (F4)
  const stationBoundingBox = useMemo(() => {
    const box = new THREE.Box3();
    if (metro.stations.length === 0) {
      box.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 5, 10));
      return box;
    }
    for (const station of metro.stations) {
      const [x, y, z] = station.position3D;
      // Station base
      box.expandByPoint(new THREE.Vector3(x, y, z));
      // Pin top
      box.expandByPoint(new THREE.Vector3(x, y + 1.8, z));
      // Card anchor
      box.expandByPoint(new THREE.Vector3(x, y + 2.8, z));
    }
    // Stage headers
    const headers = deriveStageHeaders(metro);
    for (const h of headers) {
      box.expandByPoint(new THREE.Vector3(h.x, 0.57, h.z));
      box.expandByPoint(new THREE.Vector3(h.x, 2.0, h.z));
    }
    return box;
  }, [metro]);

  // Set boundary on board bounds
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !boardBounds) return;

    const boardBox = new THREE.Box3(
      new THREE.Vector3(boardBounds.minX, -2, boardBounds.minZ),
      new THREE.Vector3(boardBounds.maxX, 20, boardBounds.maxZ)
    );
    controls.setBoundary(boardBox);
  }, [boardBounds]);

  const resetView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const enableTransition = !prefersReducedMotion;
    // G2: Fit station bounding box with 8% margin inside safe area
    void controls.fitToBox(stationBoundingBox, false, {
      paddingLeft: 0.8,
      paddingRight: 0.8,
      paddingTop: 1.0,
      paddingBottom: 0.9,
    }).then(() => {
      // G2: Azimuth -15°, lower camera to polar 52° so horizon and board edge are outside viewport
      void controls.rotateTo(
        (-15 * Math.PI) / 180,
        (52 * Math.PI) / 180,
        enableTransition
      );
    });
  }, [stationBoundingBox, prefersReducedMotion]);

  // Initial fitToBox
  useEffect(() => {
    if (metro.stations.length > 0 && !initialFittedRef.current) {
      initialFittedRef.current = true;
      const t = setTimeout(() => {
        resetView();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [metro.stations, resetView]);

  // Station focus or selection transition (visual-direction §5: setLookAt(station + (7, 8, 9), station, true))
  const targetStationId = selectedStepId || focusedStepId;
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !targetStationId) return;

    const station = metro.stations.find((s) => s.id === targetStationId);
    if (!station) return;

    const [x, y, z] = station.position3D;
    const enableTransition = !prefersReducedMotion;

    if (selectedStepId) {
      // G4: Selected station framed in visible area left of drawer, ~25% viewport height
      // Shift target to the right along camera plane so station lands in center of remaining area
      const targetX = x + 2.7;
      const targetY = y + 0.5;
      const targetZ = z + 0.7;

      const camX = targetX - 5.55;
      const camY = targetY + 18.0;
      const camZ = targetZ + 20.7;

      void controls.setLookAt(
        camX,
        camY,
        camZ,
        targetX,
        targetY,
        targetZ,
        enableTransition
      );
    } else {
      // Focused station without drawer open
      void controls.setLookAt(
        x - 5.55,
        y + 18.0,
        z + 20.7,
        x,
        y,
        z,
        enableTransition
      );
    }
  }, [targetStationId, selectedStepId, focusedStepId, metro.stations, prefersReducedMotion]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={10}
      maxDistance={120}
      maxPolarAngle={(70 * Math.PI) / 180}
      minPolarAngle={(10 * Math.PI) / 180}
    />
  );
}
