"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type { MetroVM } from "@/lib/graph/viewModel";
import type { ComposedJourney } from "@/lib/contract/compose";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { planCity, type StationLocation, type TrackLocation } from "./city/planCity";
import { Board } from "./Board";
import { Roads } from "./city/Roads";
import { Traffic } from "./city/Traffic";
import { Pedestrians } from "./city/Pedestrians";
import { CityBatches } from "./CityBatches";
import { Stations } from "./Stations";
import { Tracks } from "./Tracks";
import { Pulses } from "./Pulses";
import { LabelProjector } from "./labels/LabelProjector";
import { StageHeaderProjector } from "./StageHeaderProjector";
import { CameraRig } from "./CameraRig";
import { useSceneKeyboard } from "./useSceneKeyboard";
import { PALETTE } from "./palette";

export interface SceneDebugMetrics {
  sceneDraws: number;
  frameCalls: number;
  sceneTris: number;
  frameTris: number;
  fps: number;
}

// Global debug listener for the debug overlay in ExplorerShell
export let currentDebugMetrics: SceneDebugMetrics = {
  sceneDraws: 0,
  frameCalls: 0,
  sceneTris: 0,
  frameTris: 0,
  fps: 60,
};

const listeners = new Set<(metrics: SceneDebugMetrics) => void>();
export function subscribeDebugMetrics(cb: (m: SceneDebugMetrics) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function countSceneMetrics(root: THREE.Object3D): { draws: number; tris: number } {
  let draws = 0;
  let tris = 0;

  function traverseVisible(obj: THREE.Object3D) {
    if (!obj.visible) return;

    const bm = obj as unknown as THREE.BatchedMesh;
    if (Boolean(bm.isBatchedMesh) && typeof bm.instanceCount === "number") {
      draws++;
      const count = bm.instanceCount;
      for (let i = 0; i < count; i++) {
        if (typeof bm.getVisibleAt === "function" && !bm.getVisibleAt(i)) continue;
        const gId = typeof bm.getGeometryIdAt === "function" ? bm.getGeometryIdAt(i) : -1;
        if (gId >= 0 && typeof bm.getGeometryRangeAt === "function") {
          const range = bm.getGeometryRangeAt(gId);
          if (range) {
            const count = range.indexCount > 0 ? range.indexCount : range.vertexCount;
            tris += Math.floor(count / 3);
          }
        }
      }
    } else if (obj instanceof THREE.InstancedMesh) {
      draws++;
      const geom = obj.geometry;
      if (geom) {
        const count = geom.index ? geom.index.count : (geom.attributes.position ? geom.attributes.position.count : 0);
        tris += Math.floor((count / 3) * obj.count);
      }
    } else if (obj instanceof THREE.Mesh) {
      draws++;
      const geom = obj.geometry;
      if (geom) {
        const count = geom.index ? geom.index.count : (geom.attributes.position ? geom.attributes.position.count : 0);
        tris += Math.floor(count / 3);
      }
    } else if (obj instanceof THREE.Line) {
      draws++;
    }

    for (const child of obj.children) {
      traverseVisible(child);
    }
  }

  traverseVisible(root);
  return { draws, tris };
}

/** Hooks scene.onAfterRender to read renderer.info right after the scene pass. Returns the undo. */
function installAfterRenderProbe(
  target: THREE.Scene,
  onRead: (calls: number, triangles: number) => void
): () => void {
  const previous = target.onAfterRender;
  target.onAfterRender = function (this: THREE.Scene, renderer, ...rest) {
    previous.call(this, renderer, ...rest);
    onRead(renderer.info.render.calls, renderer.info.render.triangles);
  };
  return () => {
    target.onAfterRender = previous;
  };
}

function DebugCollector() {
  const { scene } = useThree();
  const lastTraverseRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);
  const fpsRef = useRef(60);
  const sceneDrawsRef = useRef(0);
  const sceneTrisRef = useRef(0);
  const lastCallsRef = useRef(0);
  const lastTrianglesRef = useRef(0);

  // Read the counters right after the main scene is drawn. EffectComposer (Bloom) resets
  // renderer.info itself and then draws a full-screen triangle, so reading gl.info at the start of
  // the next frame only ever saw that last pass ("1 call, 1 triangle"). scene.onAfterRender fires
  // for the RenderPass, when the counters hold exactly the scene's own draw calls for this frame.
  const getThree = useThree((state) => state.get);
  useEffect(() => {
    return installAfterRenderProbe(getThree().scene, (calls, triangles) => {
      if (calls > 0) lastCallsRef.current = calls;
      if (triangles > 0) lastTrianglesRef.current = triangles;
    });
  }, [getThree]);

  // Priority -1 runs before the render, so each frame starts from zero.
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
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

    // 3. Count scene draws and scene tris (immediately on first frame, then every 0.5s)
    if (sceneDrawsRef.current === 0 || time - lastTraverseRef.current >= 0.5) {
      const { draws, tris } = countSceneMetrics(scene);
      sceneDrawsRef.current = draws;
      sceneTrisRef.current = tris;
      lastTraverseRef.current = time;

      // Broadcast metrics
      currentDebugMetrics = {
        sceneDraws: sceneDrawsRef.current,
        frameCalls: lastCallsRef.current,
        sceneTris: sceneTrisRef.current,
        frameTris: lastTrianglesRef.current,
        fps: fpsRef.current,
      };
      listeners.forEach((cb) => cb(currentDebugMetrics));
    }
  }, -1);

  return null;
}

interface MetroSceneProps {
  metro: MetroVM;
  journey?: ComposedJourney | null;
  cardSlotsRef?: React.RefObject<Map<string, HTMLDivElement>>;
  tetherRefs?: React.RefObject<Map<string, SVGSVGElement>>;
  tooltipRef?: React.RefObject<HTMLDivElement | null>;
  headerSlotsRef?: React.RefObject<(HTMLDivElement | null)[]>;
  onDprChange?: (dpr: number) => void;
  onSceneReady?: () => void;
}

export function MetroScene({
  metro,
  journey,
  cardSlotsRef,
  tetherRefs,
  tooltipRef,
  headerSlotsRef,
  onDprChange,
  onSceneReady,
}: MetroSceneProps) {
  const activeTaskId = useTaskStore((s) => s.activeTaskId);

  // Performance degradation stages:
  // 0: Full (Bloom on, dpr 2, shadow 2048, props on)
  // 1: Bloom off
  // 2: dpr 1
  // 3: shadow map 1024
  // 4: hide props
  const [perfLevel, setPerfLevel] = useState(0);

  // Hook keyboard navigation
  useSceneKeyboard(metro, journey);

  // Shader warm-up before first visible frame with narrow useThree selectors (§9.2, A14)
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const warmUpRef = useRef(false);

  useEffect(() => {
    if (!warmUpRef.current && gl) {
      warmUpRef.current = true;
      if (
        typeof (gl as unknown as { compileAsync?: unknown }).compileAsync ===
        "function"
      ) {
        (gl as THREE.WebGLRenderer)
          .compileAsync(scene, camera)
          .then(() => {
            onSceneReady?.();
          })
          .catch(() => {
            onSceneReady?.();
          });
      } else {
        onSceneReady?.();
      }
    }
  }, [gl, scene, camera, onSceneReady]);

  // Compute deterministic city plan
  const plan = useMemo(() => {
    const stations: StationLocation[] = metro.stations.map((s) => ({
      id: s.id,
      position3D: s.position3D,
    }));
    const tracks: TrackLocation[] = metro.tracks.map((t) => ({
      id: t.id,
      from: t.from,
      to: t.to,
    }));

    return planCity({
      taskId: activeTaskId || "mumbai-default",
      stations,
      tracks,
    });
  }, [activeTaskId, metro.stations, metro.tracks]);

  const isDebug =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";

  const handleDecline = () => {
    setPerfLevel((prev) => {
      const next = Math.min(prev + 1, 4);
      if (next >= 2) onDprChange?.(1);
      return next;
    });
  };

  const handleIncline = () => {
    setPerfLevel((prev) => {
      const next = Math.max(prev - 1, 0);
      if (next < 2) onDprChange?.(2);
      return next;
    });
  };

  const bloomEnabled = perfLevel < 1;
  const visibleProps = perfLevel < 4;

  return (
    <>
      <fog attach="fog" args={[PALETTE.sky, 60, 160]} />
      <PerformanceMonitor onDecline={handleDecline} onIncline={handleIncline} />
      {isDebug && <DebugCollector />}

      {/* 1. Board slab, coastal water shader, and lighting */}
      <Board plan={plan} />

      {/* 1b. Kenney road tiles in BatchedMesh (+1 draw, visual-direction §10.2) */}
      <Roads plan={plan} />

      {/* 2. BatchedMesh city buildings and props */}
      <CityBatches plan={plan} visibleProps={visibleProps} stations={metro.stations} />

      {/* 2b. Traffic: keep-left cars and parked service vehicles in BatchedMesh (+1 draw, §10.3) */}
      <Traffic plan={plan} stations={metro.stations} stopped={perfLevel >= 3} />

      {/* 2c. Pedestrians: walkers and office queues in InstancedMesh (+1 draw, §10.4) */}
      <Pedestrians plan={plan} stations={metro.stations} stopped={perfLevel >= 2} />

      {/* 3. Stations with plaza rings, beacons, dimmed locked, and outline */}
      <Stations stations={metro.stations} journey={journey} />

      {/* 4. Routes batches (flat 0.35 ribbons following streets, §11.5) */}
      <Tracks metro={metro} plan={plan} />

      {/* 5. Pulses (following road polyline, §11.5) */}
      <Pulses metro={metro} plan={plan} />

      {/* 6. Screen-projected DOM Label system (§11.2 & §11.4) */}
      {cardSlotsRef && tetherRefs && (
        <LabelProjector
          metro={metro}
          cardSlotsRef={cardSlotsRef}
          tetherRefs={tetherRefs}
          tooltipRef={tooltipRef}
        />
      )}

      {/* 6b. Screen-projected DOM Stage Header system */}
      {headerSlotsRef && (
        <StageHeaderProjector
          metro={metro}
          slotsRef={headerSlotsRef}
        />
      )}

      {/* 7. Camera rig with isometric bounds fitting */}
      <CameraRig metro={metro} boardBounds={plan.bounds} />

      {/* 8. Post-processing: EffectComposer with Bloom only per visual-direction §5 */}
      <EffectComposer multisampling={4}>
        {bloomEnabled && (
          <Bloom
            mipmapBlur
            luminanceThreshold={1.0}
            intensity={0.6}
          />
        )}
      </EffectComposer>
    </>
  );
}
