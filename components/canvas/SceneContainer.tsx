"use client";

import { useEffect, useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import type { MetroVM } from "@/lib/graph/viewModel";
import { MetroScene } from "./MetroScene";
import { useViewStore } from "@/lib/store/useViewStore";
import { PALETTE } from "./palette";

interface SceneContainerProps {
  metro: MetroVM;
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
  const [webglError, setWebglError] = useState<string | null>(() =>
    !supported ? "WebGL is unavailable. Switched to 2D flowchart view." : null
  );
  const setViewMode = useViewStore((s) => s.setViewMode);

  useEffect(() => {
    if (!supported) {
      setViewMode("2d");
    }
  }, [supported, setViewMode]);

  if (!supported || webglError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-950 p-6 text-center">
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-300 shadow-xl">
          {webglError ?? "WebGL is unavailable. Switched to 2D view."}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={dpr}
        shadows
        camera={{ position: [20, 22, 25], fov: 45 }}
        style={{ background: PALETTE.background }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.info.autoReset = false;
          gl.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            setWebglError(
              "WebGL context was lost. Switching to 2D flowchart view."
            );
            setViewMode("2d");
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
