"use client";

import { useState, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import type { MetroVM } from "@/lib/graph/viewModel";
import { Ground } from "./Ground";
import { Stations } from "./Stations";
import { Tracks } from "./Tracks";
import { Pulses } from "./Pulses";
import { StationLabels } from "./StationLabels";
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
  const { gl, scene } = useThree();
  const lastTraverseRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);
  const fpsRef = useRef(60);
  const sceneDrawsRef = useRef(0);

  // Priority -1 ensures this runs before rendering passes
  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    // 1. Read previous frame's total calls from gl.info, then reset
    const calls = gl.info.render.calls;
    gl.info.reset();

    // 2. Calculate FPS
    frameCountRef.current++;
    if (time - lastFpsTimeRef.current >= 0.5) {
      fpsRef.current = Math.round(
        (frameCountRef.current / (time - lastFpsTimeRef.current))
      );
      frameCountRef.current = 0;
      lastFpsTimeRef.current = time;
    }

    // 3. Count scene draws once per second
    if (time - lastTraverseRef.current >= 1.0) {
      let count = 0;
      scene.traverse((obj) => {
        // Visible meshes, instanced meshes, and line segments in the scene
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const o = obj as any;
        if (
          o.visible &&
          (o.isMesh || o.isInstancedMesh || o.isLine || o.isLineSegments)
        ) {
          count++;
        }
      });
      sceneDrawsRef.current = count;
      lastTraverseRef.current = time;

      // Broadcast metrics
      currentDebugMetrics = {
        sceneDraws: sceneDrawsRef.current,
        frameCalls: calls,
        fps: fpsRef.current,
      };
      listeners.forEach((cb) => cb(currentDebugMetrics));
    }
  }, -1);

  return null;
}

interface MetroSceneProps {
  metro: MetroVM;
  onDprChange?: (dpr: number) => void;
}

export function MetroScene({ metro, onDprChange }: MetroSceneProps) {
  const [bloomEnabled, setBloomEnabled] = useState(true);

  // Hook keyboard navigation
  useSceneKeyboard(metro);

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
      <DebugCollector />

      <Ground />
      <Stations stations={metro.stations} />
      <Tracks metro={metro} />
      <Pulses metro={metro} />
      <StationLabels metro={metro} />
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
