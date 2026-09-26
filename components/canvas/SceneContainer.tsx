"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import type { MetroVM } from "@/lib/graph/viewModel";
import { MetroScene } from "./MetroScene";
import { LabelLayer } from "./labels/LabelLayer";
import { useViewStore } from "@/lib/store/useViewStore";
import { PALETTE } from "./palette";

interface SceneContainerProps {
  metro: MetroVM;
}

function checkWebGLSupport(): boolean {
  if (typeof window === "undefined") return true;

  // Development-only test hook: ?nowebgl=1
  if (process.env.NODE_ENV === "development") {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("nowebgl") === "1") {
      return false;
    }
  }

  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

export default function SceneContainer({ metro }: SceneContainerProps) {
  const [dpr, setDpr] = useState<number | [number, number]>([1, 2]);
  const supported = useMemo(() => checkWebGLSupport(), []);
  const setViewMode = useViewStore((s) => s.setViewMode);
  const setWebglFallbackReason = useViewStore((s) => s.setWebglFallbackReason);
  const labelSlotsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const isDebug = useMemo(() => {
    return (
      process.env.NODE_ENV === "development" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "1"
    );
  }, []);

  useEffect(() => {
    if (!supported) {
      setViewMode("2d");
      setWebglFallbackReason(
        "WebGL is unavailable or disabled. Switched to 2D flowchart view."
      );
    }
  }, [supported, setViewMode, setWebglFallbackReason]);

  if (!supported) {
    return null;
  }

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={dpr}
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ position: [20, 22, 25], fov: 45 }}
        style={{ background: PALETTE.background }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: isDebug,
        }}
        onCreated={({ gl }) => {
          if (isDebug) {
            gl.info.autoReset = false;
          }
          gl.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            setViewMode("2d");
            setWebglFallbackReason(
              "WebGL context was lost. Switched to 2D flowchart view."
            );
          });
        }}
      >
        <MetroScene
          metro={metro}
          slotsRef={labelSlotsRef}
          onDprChange={(newDpr) => setDpr(newDpr)}
        />
      </Canvas>
      <LabelLayer metro={metro} slotsRef={labelSlotsRef} />
    </div>
  );
}
