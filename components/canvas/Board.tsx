"use client";

import { useMemo, useRef, useLayoutEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PALETTE } from "./palette";
import { HEIGHTS } from "./heights";
import type { CityPlan } from "./city/planCity";

interface BoardProps {
  plan: CityPlan;
}

const WATER_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vViewPosition;

void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const WATER_FRAGMENT_SHADER = `
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform vec3 uFogColor;
uniform float uTime;

varying vec2 vUv;
varying vec3 vViewPosition;

void main() {
  // Two scrolling sine bands
  float wave1 = sin(vUv.x * 20.0 + uTime * 1.2 + vUv.y * 10.0) * 0.5 + 0.5;
  float wave2 = cos(vUv.x * 14.0 - uTime * 0.9 + vUv.y * 16.0) * 0.5 + 0.5;
  float wave = (wave1 + wave2) * 0.5;

  vec3 waterColor = mix(uColorDeep, uColorShallow, wave * 0.4);

  // Fresnel toward fog color
  vec3 viewDir = normalize(vViewPosition);
  float fresnel = pow(1.0 - max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
  vec3 finalColor = mix(waterColor, uFogColor, fresnel * 0.5);

  gl_FragColor = vec4(finalColor, 0.96);
}
`;

export function Board({ plan }: BoardProps) {
  const { bounds, promenadeZ } = plan;
  const shadowLightRef = useRef<THREE.DirectionalLight>(null);
  const waterMaterialRef = useRef<THREE.ShaderMaterial>(null);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // 1. Diorama Land Slab Geometry (covers land only, top at y = 0.17)
  const landSlabGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const x0 = bounds.minX;
    const x1 = bounds.maxX;
    const z0 = bounds.minZ;
    const z1 = promenadeZ;
    const radius = 2.5;

    shape.moveTo(x0 + radius, z0);
    shape.lineTo(x1 - radius, z0);
    shape.quadraticCurveTo(x1, z0, x1, z0 + radius);
    shape.lineTo(x1, z1);
    shape.lineTo(x0, z1);
    shape.lineTo(x0, z0 + radius);
    shape.quadraticCurveTo(x0, z0, x0 + radius, z0);

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: 0.77,
      bevelEnabled: false,
    });
    geom.rotateX(Math.PI / 2);
    geom.translate(0, HEIGHTS.landTop, 0); // Land top at y = 0.170 (§11.5)
    return geom;
  }, [bounds, promenadeZ]);

  // 1b. Sea Basin Slab Geometry (floor at y = 0.00, down to -0.60)
  const basinSlabGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const x0 = bounds.minX;
    const x1 = bounds.maxX;
    const z0 = promenadeZ;
    const z1 = bounds.maxZ;
    const radius = 2.5;

    shape.moveTo(x0, z0);
    shape.lineTo(x1, z0);
    shape.lineTo(x1, z1 - radius);
    shape.quadraticCurveTo(x1, z1, x1 - radius, z1);
    shape.lineTo(x0 + radius, z1);
    shape.quadraticCurveTo(x0, z1, x0, z1 - radius);
    shape.lineTo(x0, z0);

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: 0.60,
      bevelEnabled: false,
    });
    geom.rotateX(Math.PI / 2);
    geom.translate(0, 0.00, 0);
    return geom;
  }, [bounds, promenadeZ]);

  // Slab materials: land top, slabSide edges
  const slabMaterials = useMemo(() => {
    const topMat = new THREE.MeshStandardMaterial({
      color: PALETTE.land,
      roughness: 0.85,
      metalness: 0.05,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: PALETTE.slabSide,
      roughness: 0.9,
      metalness: 0.05,
    });
    return [topMat, sideMat];
  }, []);

  const basinMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.slabSide,
        roughness: 0.95,
        metalness: 0.05,
      }),
    []
  );

  // 2. Water Plane Material & Geometry
  const waterGeometry = useMemo(() => {
    const waterDepth = bounds.maxZ - promenadeZ;
    const waterWidth = bounds.width;
    const geom = new THREE.PlaneGeometry(waterWidth, waterDepth, 32, 16);
    geom.rotateX(-Math.PI / 2);
    return geom;
  }, [bounds.width, bounds.maxZ, promenadeZ]);

  const waterMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: WATER_FRAGMENT_SHADER,
      uniforms: {
        uColorDeep: { value: new THREE.Color(PALETTE.seaDeep) },
        uColorShallow: { value: new THREE.Color(PALETTE.seaShallow) },
        uFogColor: { value: new THREE.Color(PALETTE.fog) },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: true,
    });
  }, []);

  useFrame((state) => {
    if (waterMaterialRef.current && !prefersReducedMotion) {
      const uTime = waterMaterialRef.current.uniforms['uTime'];
      if (uTime) {
        uTime.value = state.clock.getElapsedTime();
      }
    }
  });

  // Update shadow camera bounds whenever board bounds change
  useLayoutEffect(() => {
    if (shadowLightRef.current) {
      const cam = shadowLightRef.current.shadow.camera;
      const halfW = bounds.width / 2 + 5;
      const halfD = bounds.depth / 2 + 5;
      cam.left = -halfW;
      cam.right = halfW;
      cam.top = halfD;
      cam.bottom = -halfD;
      cam.updateProjectionMatrix();
    }
  }, [bounds]);

  return (
    <group>
      {/* Lighting per visual-direction §5 */}
      <hemisphereLight
        color={PALETTE.hemiSky}
        groundColor={PALETTE.hemiGround}
        intensity={1.1}
      />
      <directionalLight
        ref={shadowLightRef}
        position={[-18, 30, 22]}
        color={PALETTE.sun}
        intensity={2.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={120}
      />

      {/* Land Slab (covers land only, top at y = 0.17, 0.15 bank drops along promenadeZ) */}
      <mesh
        geometry={landSlabGeometry}
        material={slabMaterials}
        receiveShadow
        castShadow
      />

      {/* Sea Basin Slab (floor at y = 0.00) */}
      <mesh
        geometry={basinSlabGeometry}
        material={basinMaterial}
        receiveShadow
        castShadow
      />

      {/* Park grass patches: flat grass tint on park cells at y = 0.171 (§11.8) */}
      <ParkGrass plan={plan} />

      {/* Coastal Water (water surface at y = 0.02) */}
      <mesh
        ref={(el) => {
          if (el) waterMaterialRef.current = el.material as THREE.ShaderMaterial;
        }}
        geometry={waterGeometry}
        material={waterMaterial}
        position={[
          bounds.centerX,
          0.02,
          (promenadeZ + bounds.maxZ) / 2,
        ]}
      />
    </group>
  );
}

function ParkGrass({ plan }: { plan: CityPlan }) {
  const { cellGrid, bounds } = plan;
  const { rows, cols, cellSize, cells } = cellGrid;

  const parkCells = useMemo(() => {
    const list: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r]?.[c] === "park") {
          const cx = bounds.minX + (c + 0.5) * cellSize;
          const cz = bounds.minZ + (r + 0.5) * cellSize;
          list.push([cx, cz]);
        }
      }
    }
    return list;
  }, [rows, cols, cellSize, cells, bounds]);

  const instancedMesh = useMemo(() => {
    if (parkCells.length === 0) return null;
    const geom = new THREE.PlaneGeometry(cellSize - 0.04, cellSize - 0.04);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.park, // #B7CF95 grass tint per §11.8 & palette.ts
      roughness: 0.9,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mesh = new THREE.InstancedMesh(geom, mat, parkCells.length);
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);

    for (let i = 0; i < parkCells.length; i++) {
      const [x, z] = parkCells[i]!;
      pos.set(x, 0.171, z);
      m.compose(pos, quat, scale);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [parkCells, cellSize]);

  if (!instancedMesh) return null;
  return <primitive object={instancedMesh} />;
}
