"use client";

import { CameraControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { useViewStore } from "@/lib/store/useViewStore";

export function CameraRig() {
  const controlsRef = useRef<CameraControls>(null);
  const focusedStepId = useViewStore((s) => s.focusedStepId);

  useEffect(() => {
    if (!focusedStepId || !controlsRef.current) return;
    // TODO(M2): animate camera to focus on step position when 3D node coordinates are laid out
  }, [focusedStepId]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={5}
      maxDistance={50}
      maxPolarAngle={Math.PI / 2.1}
    />
  );
}
