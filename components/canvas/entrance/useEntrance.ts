"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { shouldPlayEntrance, consumeArrivedFromLanding } from "./entranceState";

export function easeBackOut(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export interface EntranceController {
  isEntering: boolean;
  getElapsed: () => number;
  getCitySettled: () => boolean;
  routeProgress: number;
  labelsOpacity: number;
  finishEntrance: () => void;
}

export function useEntrance(): EntranceController {
  const [isEntering, setIsEntering] = useState(() => {
    if (typeof window === "undefined") return false;
    const play = shouldPlayEntrance();
    if (play) {
      consumeArrivedFromLanding();
    }
    return play;
  });

  const elapsedRef = useRef(0);
  const citySettledRef = useRef(false);
  const [routeProgress, setRouteProgress] = useState(() => (isEntering ? 0 : 1));
  const [labelsOpacity, setLabelsOpacity] = useState(() => (isEntering ? 0 : 1));

  const finishEntrance = useCallback(() => {
    setIsEntering(false);
    citySettledRef.current = true;
    setRouteProgress(1);
    setLabelsOpacity(1);
  }, []);

  // Cancel entrance on any user interaction (§9.4)
  useEffect(() => {
    if (!isEntering) return;

    const cancel = () => {
      finishEntrance();
    };

    window.addEventListener("pointerdown", cancel, { passive: true });
    window.addEventListener("keydown", cancel, { passive: true });
    window.addEventListener("wheel", cancel, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("keydown", cancel);
      window.removeEventListener("wheel", cancel);
    };
  }, [isEntering, finishEntrance]);

  useFrame((_, delta) => {
    if (!isEntering) return;

    // Advance elapsed time
    elapsedRef.current += delta;
    const elapsed = elapsedRef.current;

    // 0.4–1.2s: routes draw
    if (elapsed >= 0.4 && elapsed <= 1.2) {
      setRouteProgress(Math.min(1, Math.max(0, (elapsed - 0.4) / 0.8)));
    } else if (elapsed > 1.2 && routeProgress < 1) {
      setRouteProgress(1);
    }

    // 1.2–1.6s: labels fade in
    if (elapsed >= 1.2 && elapsed <= 1.6) {
      setLabelsOpacity(Math.min(1, Math.max(0, (elapsed - 1.2) / 0.4)));
    } else if (elapsed > 1.6 && labelsOpacity < 1) {
      setLabelsOpacity(1);
    }

    // City settles after 1.4s
    if (elapsed >= 1.4 && !citySettledRef.current) {
      citySettledRef.current = true;
    }

    // Entrance completes at 2.4s
    if (elapsed >= 2.4) {
      finishEntrance();
    }
  });

  const getElapsed = useCallback(() => (isEntering ? elapsedRef.current : 2.4), [isEntering]);
  const getCitySettled = useCallback(() => citySettledRef.current, []);

  return {
    isEntering,
    getElapsed,
    getCitySettled,
    routeProgress: isEntering ? routeProgress : 1,
    labelsOpacity: isEntering ? labelsOpacity : 1,
    finishEntrance,
  };
}
