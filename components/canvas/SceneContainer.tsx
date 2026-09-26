"use client";

import { Canvas } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { CameraRig } from "./CameraRig";

export default function SceneContainer() {
  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [10, 10, 10], fov: 45 }}
        style={{ background: "#09090b" }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 15, 10]} intensity={1.5} />
        <Grid
          infiniteGrid
          cellSize={1}
          sectionSize={5}
          sectionColor="#27272a"
          cellColor="#18181b"
          fadeDistance={40}
        />
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color="#06b6d4"
            emissive="#06b6d4"
            emissiveIntensity={1.2}
          />
        </mesh>
        <CameraRig />
        <EffectComposer>
          <Bloom
            mipmapBlur
            luminanceThreshold={0.6}
            intensity={0.6}
          />
        </EffectComposer>
      </Canvas>
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-md border border-white/10 bg-zinc-950/60 px-2 py-1 text-xs text-zinc-400 backdrop-blur-xs">
        3D Smoke Scene Placeholder
      </div>
    </div>
  );
}
