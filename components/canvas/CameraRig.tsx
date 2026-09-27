"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { CameraControls } from "@react-three/drei";
import type { MetroVM } from "@/lib/graph/viewModel";
import { useViewStore } from "@/lib/store/useViewStore";

interface CameraRigProps {
  metro: MetroVM;
}

export function CameraRig({ metro }: CameraRigProps) {
  const controlsRef = useRef<CameraControls>(null);
  const focusedStepId = useViewStore((s) => s.focusedStepId);
  const initialFittedRef = useRef(false);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Compute scene bounding box
  const boundingBox = useMemo(() => {
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
    // Add margin for station geometries
    box.expandByScalar(2);
    return box;
  }, [metro.stations]);

  const resetView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const enableTransition = !prefersReducedMotion;
    void controls.fitToBox(boundingBox, enableTransition, {
      paddingLeft: 1.5,
      paddingRight: 1.5,
      paddingTop: 1.5,
      paddingBottom: 1.5,
    });
    void controls.rotateTo(
      (-35 * Math.PI) / 180,
      (55 * Math.PI) / 180,
      enableTransition
    );
  }, [boundingBox, prefersReducedMotion]);

  // Initial fitToBox
  useEffect(() => {
    if (metro.stations.length > 0 && !initialFittedRef.current) {
      initialFittedRef.current = true;
      // Slight delay to ensure canvas camera has initialized
      const t = setTimeout(() => {
        resetView();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [metro.stations, resetView]);

  // Station focus transition
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !focusedStepId) return;

    const station = metro.stations.find((s) => s.id === focusedStepId);
    if (!station) return;

    const [x, y, z] = station.position3D;
    const enableTransition = !prefersReducedMotion;

    void controls.setLookAt(
      x + 6,
      y + 7,
      z + 8,
      x,
      y,
      z,
      enableTransition
    );
  }, [focusedStepId, metro.stations, prefersReducedMotion]);

  return (
    <>
      <CameraControls
        ref={controlsRef}
        makeDefault
        minDistance={6}
        maxDistance={70}
        maxPolarAngle={(80 * Math.PI) / 180}
        minPolarAngle={(10 * Math.PI) / 180}
      />
    </>
  );
}
