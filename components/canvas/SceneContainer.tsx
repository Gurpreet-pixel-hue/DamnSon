"use client";

import { useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import type { MetroVM } from "@/lib/graph/viewModel";
import { MetroScene } from "./MetroScene";
import { useViewStore } from "@/lib/store/useViewStore";
import { PALETTE } from "./palette";

interface SceneContainerProps {
  metro: MetroVM;
}

// React 19 + @react-three/drei 10.x compatibility:
// Drei <Html> invokes currentRoot.unmount() inside layout effect cleanup, which triggers
// React 19's sync-unmount console.error. We suppress only this specific upstream warning.
if (typeof window !== "undefined") {
  const origError = console.error;
  console.error = function (...args: unknown[]) {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (
      msg.includes(
        "Attempted to synchronously unmount a root while React was already rendering"
      )
    ) {
      return;
    }
    origError.apply(console, args);
  };
}

function checkWebGLSupport(): boolean {
  if (typeof window === "undefined") return true;

  // Development-only test hook: ?nowebgl=1
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get("nowebgl") === "1") {
    return false;
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
          preserveDrawingBuffer: true,
        }}
        onCreated={({ gl }) => {
          gl.info.autoReset = false;
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
          onDprChange={(newDpr) => setDpr(newDpr)}
        />
      </Canvas>
    </div>
  );
}
