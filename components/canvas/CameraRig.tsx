"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { CameraControls } from "@react-three/drei";
import type { MetroVM } from "@/lib/graph/viewModel";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
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

  // Compute station bounding box for fitToBox
  const stationBoundingBox = useMemo(() => {
    const box = new THREE.Box3();
    if (metro.stations.length === 0) {
      box.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 5, 10));
      return box;
    }
    for (const station of metro.stations) {
      box.expandByPoint(
        new THREE.Vector3(
          station.position3D[0],
          station.position3D[1],
          station.position3D[2]
        )
      );
    }
    return box;
  }, [metro.stations]);

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
    // visual-direction §5: fitToBox over station bounds with padding 1.2
    void controls.fitToBox(stationBoundingBox, enableTransition, {
      paddingLeft: 1.2,
      paddingRight: 1.2,
      paddingTop: 1.2,
      paddingBottom: 1.2,
    });
    // visual-direction §5: initial azimuth -35°, polar 52°
    void controls.rotateTo(
      (-35 * Math.PI) / 180,
      (52 * Math.PI) / 180,
      enableTransition
    );
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

    void controls.setLookAt(
      x + 7,
      y + 8,
      z + 9,
      x,
      y,
      z,
      enableTransition
    );
  }, [targetStationId, metro.stations, prefersReducedMotion]);

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
