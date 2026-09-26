"use client";

import { useState, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { MetroVM } from "@/lib/graph/viewModel";
import { Ground } from "./Ground";
import { Stations } from "./Stations";
import { Tracks } from "./Tracks";
import { Pulses } from "./Pulses";
import { LabelProjector } from "./labels/LabelProjector";
import { CameraRig } from "./CameraRig";
import { useSceneKeyboard } from "./useSceneKeyboard";

export interface SceneDebugMetrics {
  sceneDraws: number;
  frameCalls: number;
  fps: number;
}

// Global debug listener for the debug overlay in ExplorerShell
export let currentDebugMetrics: SceneDebugMetrics = {
  sceneDraws: 0,
  frameCalls: 0,
  fps: 60,
};

const listeners = new Set<(metrics: SceneDebugMetrics) => void>();
export function subscribeDebugMetrics(cb: (m: SceneDebugMetrics) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function DebugCollector() {
  const { scene } = useThree();
  const lastTraverseRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);
  const fpsRef = useRef(60);
  const sceneDrawsRef = useRef(0);
  const lastCallsRef = useRef(0);

  // Priority -1 ensures this runs before rendering passes
  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    // 1. Read previous frame's total calls from gl.info, then reset
    const calls = state.gl.info.render.calls;
    if (calls > 0) {
      lastCallsRef.current = calls;
    }
    state.gl.info.reset();

    // 2. Calculate FPS
    frameCountRef.current++;
    if (time - lastFpsTimeRef.current >= 0.5) {
      fpsRef.current = Math.round(
        frameCountRef.current / (time - lastFpsTimeRef.current)
      );
      frameCountRef.current = 0;
      lastFpsTimeRef.current = time;
    }

    // 3. Count scene draws (immediately on first frame, then every 0.5s)
    if (sceneDrawsRef.current === 0 || time - lastTraverseRef.current >= 0.5) {
      let count = 0;
      scene.traverse((obj) => {
        if (
          obj.visible &&
          (obj instanceof THREE.Mesh || obj instanceof THREE.Line)
        ) {
          count++;
        }
      });
      sceneDrawsRef.current = count;
      lastTraverseRef.current = time;

      // Broadcast metrics
      currentDebugMetrics = {
        sceneDraws: sceneDrawsRef.current,
        frameCalls: lastCallsRef.current,
        fps: fpsRef.current,
      };
      listeners.forEach((cb) => cb(currentDebugMetrics));
    }
  }, -1);

  return null;
}

interface MetroSceneProps {
  metro: MetroVM;
  slotsRef?: React.RefObject<(HTMLButtonElement | null)[]>;
  onDprChange?: (dpr: number) => void;
}

export function MetroScene({ metro, slotsRef, onDprChange }: MetroSceneProps) {
  const [bloomEnabled, setBloomEnabled] = useState(true);

  // Hook keyboard navigation
  useSceneKeyboard(metro);

  const isDebug =
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";

  const handleDecline = () => {
    setBloomEnabled(false);
    onDprChange?.(1);
  };

  const handleIncline = () => {
    setBloomEnabled(true);
    onDprChange?.(2);
  };

  return (
    <>
      <PerformanceMonitor onDecline={handleDecline} onIncline={handleIncline} />
      {isDebug && <DebugCollector />}

      <Ground />
      <Stations stations={metro.stations} />
      <Tracks metro={metro} />
      <Pulses metro={metro} />
      {slotsRef && <LabelProjector metro={metro} slotsRef={slotsRef} />}
      <CameraRig metro={metro} />

      <EffectComposer>
        {bloomEnabled && (
          <Bloom
            mipmapBlur
            luminanceThreshold={0.9}
            intensity={0.8}
          />
        )}
        <Vignette eskil={false} offset={0.1} darkness={0.6} />
      </EffectComposer>
    </>
  );
}
