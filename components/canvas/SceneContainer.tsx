"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import type { MetroVM } from "@/lib/graph/viewModel";
import type { ComposedJourney } from "@/lib/contract/compose";
import { MetroScene } from "./MetroScene";
import { LabelLayer } from "./labels/LabelLayer";
import { StageHeaders } from "./StageHeaders";
import { useViewStore } from "@/lib/store/useViewStore";
import { PALETTE } from "./palette";

interface SceneContainerProps {
  metro: MetroVM;
  journey?: ComposedJourney | null;
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

export default function SceneContainer({ metro, journey }: SceneContainerProps) {
  const [dpr, setDpr] = useState<number | [number, number]>([1, 2]);
  const supported = useMemo(() => checkWebGLSupport(), []);
  const setViewMode = useViewStore((s) => s.setViewMode);
  const setWebglFallbackReason = useViewStore((s) => s.setWebglFallbackReason);
  const cardSlotsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const tetherRefs = useRef<Map<string, SVGSVGElement>>(new Map());
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const headerSlotsRef = useRef<(HTMLDivElement | null)[]>([]);

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

  const isUnmountingRef = useRef(false);
  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
    };
  }, []);

  if (!supported) {
    return null;
  }

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={dpr}
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ position: [20, 22, 25], fov: 28, near: 1, far: 400 }}
        style={{ background: PALETTE.background }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: isDebug,
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1.0;
          if (isDebug) {
            gl.info.autoReset = false;
          }
          gl.domElement.addEventListener("webglcontextlost", (event) => {
            if (isUnmountingRef.current) return;
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
          journey={journey}
          cardSlotsRef={cardSlotsRef}
          tetherRefs={tetherRefs}
          tooltipRef={tooltipRef}
          headerSlotsRef={headerSlotsRef}
          onDprChange={(newDpr) => setDpr(newDpr)}
        />
      </Canvas>
      <StageHeaders metro={metro} slotsRef={headerSlotsRef} />
      <LabelLayer
        metro={metro}
        cardSlotsRef={cardSlotsRef}
        tetherRefs={tetherRefs}
        tooltipRef={tooltipRef}
      />
    </div>
  );
}
