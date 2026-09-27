"use client";

import { Grid } from "@react-three/drei";
import { PALETTE } from "./palette";

export function Ground() {
  return (
    <>
      <hemisphereLight intensity={0.35} />
      <directionalLight
        position={[20, 30, 10]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={150}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0005}
      />

      {/* Ground plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
      >
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial
          color={PALETTE.ground}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Ground Grid */}
      <Grid
        infiniteGrid
        cellSize={1}
        sectionSize={7}
        sectionColor={PALETTE.border}
        cellColor={PALETTE.surface}
        fadeDistance={80}
        position={[0, 0, 0]}
      />
    </>
  );
}
