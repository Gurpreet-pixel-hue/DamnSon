"use client";

import { useEffect, useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import {
  getEntranceSession,
  finishEntranceSession,
} from "./entranceState";

export function easeBackOut(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export interface EntranceController {
  isEntering: () => boolean;
  getElapsed: () => number;
  getCityProgress: (delay: number) => number;
  getRouteProgress: () => number;
  getStationProgress: (delay: number) => number;
  getLabelsOpacity: () => number;
  finishEntrance: () => void;
}

/**
 * Pure ref-based entrance controller (§9.4, A13).
 * Mutates no React state per frame; directly queried by useFrame hooks.
 */
export function useEntrance(): EntranceController {
  const isEnteringRef = useRef(false);

  useEffect(() => {
    const session = getEntranceSession();
    isEnteringRef.current = session.active;

    if (!session.active) return;

    // User interaction immediately finishes entrance (§9.4)
    const cancel = () => {
      finishEntranceSession();
      isEnteringRef.current = false;
    };

    window.addEventListener("pointerdown", cancel, { passive: true });
    window.addEventListener("keydown", cancel, { passive: true });
    window.addEventListener("wheel", cancel, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("keydown", cancel);
      window.removeEventListener("wheel", cancel);
    };
  }, []);

  useFrame(() => {
    const session = getEntranceSession();
    isEnteringRef.current = session.active;
  });

  const isEntering = useCallback(() => {
    return isEnteringRef.current && getEntranceSession().active;
  }, []);

  const getElapsed = useCallback(() => {
    const session = getEntranceSession();
    if (!session.active) return 2.4;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    return Math.max(0, (now - session.startedAt) / 1000);
  }, []);

  const getCityProgress = useCallback(
    (delay: number) => {
      const session = getEntranceSession();
      if (!session.active) return 1;
      const elapsed = getElapsed();
      return Math.max(0, Math.min(1, (elapsed - delay) / 0.35));
    },
    [getElapsed]
  );

  const getRouteProgress = useCallback(() => {
    const session = getEntranceSession();
    if (!session.active) return 1;
    const elapsed = getElapsed();
    // 0.4s to 1.2s (0.8s total)
    return Math.max(0, Math.min(1, (elapsed - 0.4) / 0.8));
  }, [getElapsed]);

  const getStationProgress = useCallback(
    (delay: number) => {
      const session = getEntranceSession();
      if (!session.active) return 1;
      const elapsed = getElapsed();
      // 0.3s to 1.0s with stagger
      return Math.max(0, Math.min(1, (elapsed - 0.3 - delay) / 0.25));
    },
    [getElapsed]
  );

  const getLabelsOpacity = useCallback(() => {
    const session = getEntranceSession();
    if (!session.active) return 1;
    const elapsed = getElapsed();
    // 1.2s to 1.6s (0.4s total)
    return Math.max(0, Math.min(1, (elapsed - 1.2) / 0.4));
  }, [getElapsed]);

  const finishEntrance = useCallback(() => {
    finishEntranceSession();
    isEnteringRef.current = false;
  }, []);

  return {
    isEntering,
    getElapsed,
    getCityProgress,
    getRouteProgress,
    getStationProgress,
    getLabelsOpacity,
    finishEntrance,
  };
}
