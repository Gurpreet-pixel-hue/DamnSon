"use client";

import { useMemo, useRef, useLayoutEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PALETTE } from "./palette";
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
  const { bounds, promenadeZ, roadSegments } = plan;
  const shadowLightRef = useRef<THREE.DirectionalLight>(null);
  const waterMaterialRef = useRef<THREE.ShaderMaterial>(null);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // 1. Diorama Slab Geometry (Extruded rounded box, 0.6 thick)
  const slabGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const x0 = bounds.minX;
    const x1 = bounds.maxX;
    const z0 = bounds.minZ;
    const z1 = bounds.maxZ;
    const radius = 2.5;

    // Build rounded rectangle on the XZ plane (using shape in 2D, extruded along -Y)
    shape.moveTo(x0 + radius, z0);
    shape.lineTo(x1 - radius, z0);
    shape.quadraticCurveTo(x1, z0, x1, z0 + radius);
    shape.lineTo(x1, z1 - radius);
    shape.quadraticCurveTo(x1, z1, x1 - radius, z1);
    shape.lineTo(x0 + radius, z1);
    shape.quadraticCurveTo(x0, z1, x0, z1 - radius);
    shape.lineTo(x0, z0 + radius);
    shape.quadraticCurveTo(x0, z0, x0 + radius, z0);

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: 0.6,
      bevelEnabled: false,
    });

    // Rotate so extrusion is downward in Y: shape is in XY, rotate to XZ
    geom.rotateX(Math.PI / 2);
    geom.translate(0, 0, 0); // top at y = 0, bottom at y = -0.6
    return geom;
  }, [bounds]);

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

  // 3. Roads & Kerbs Mesh
  const { roadGeometry, kerbGeometry } = useMemo(() => {
    const roadPositions: number[] = [];
    const roadNormals: number[] = [];
    const roadIndices: number[] = [];

    const kerbPositions: number[] = [];
    const kerbNormals: number[] = [];
    const kerbIndices: number[] = [];

    function addRibbonSegment(
      p1: [number, number],
      p2: [number, number],
      width: number,
      y: number,
      posArr: number[],
      normArr: number[],
      idxArr: number[]
    ) {
      const dx = p2[0] - p1[0];
      const dz = p2[1] - p1[1];
      const len = Math.hypot(dx, dz);
      if (len === 0) return;

      const nx = (-dz / len) * (width / 2);
      const nz = (dx / len) * (width / 2);

      const o = posArr.length / 3;
      posArr.push(
        p1[0] - nx, y, p1[1] - nz,
        p1[0] + nx, y, p1[1] + nz,
        p2[0] + nx, y, p2[1] + nz,
        p2[0] - nx, y, p2[1] - nz
      );
      for (let k = 0; k < 4; k++) {
        normArr.push(0, 1, 0);
      }
      idxArr.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }

    // A. Track roads (width 1.1) and kerbs (width 0.1 on both sides)
    for (const seg of roadSegments) {
      addRibbonSegment(seg.from, seg.to, 1.1, 0.02, roadPositions, roadNormals, roadIndices);

      // Kerb left
      const dx = seg.to[0] - seg.from[0];
      const dz = seg.to[1] - seg.from[1];
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        const nx = (-dz / len);
        const nz = (dx / len);
        const leftP1: [number, number] = [seg.from[0] - nx * 0.58, seg.from[1] - nz * 0.58];
        const leftP2: [number, number] = [seg.to[0] - nx * 0.58, seg.to[1] - nz * 0.58];
        addRibbonSegment(leftP1, leftP2, 0.1, 0.025, kerbPositions, kerbNormals, kerbIndices);

        const rightP1: [number, number] = [seg.from[0] + nx * 0.58, seg.from[1] + nz * 0.58];
        const rightP2: [number, number] = [seg.to[0] + nx * 0.58, seg.to[1] + nz * 0.58];
        addRibbonSegment(rightP1, rightP2, 0.1, 0.025, kerbPositions, kerbNormals, kerbIndices);
      }
    }

    const rGeom = new THREE.BufferGeometry();
    rGeom.setAttribute("position", new THREE.Float32BufferAttribute(roadPositions, 3));
    rGeom.setAttribute("normal", new THREE.Float32BufferAttribute(roadNormals, 3));
    rGeom.setIndex(roadIndices);

    const kGeom = new THREE.BufferGeometry();
    kGeom.setAttribute("position", new THREE.Float32BufferAttribute(kerbPositions, 3));
    kGeom.setAttribute("normal", new THREE.Float32BufferAttribute(kerbNormals, 3));
    kGeom.setIndex(kerbIndices);

    return { roadGeometry: rGeom, kerbGeometry: kGeom };
  }, [roadSegments]);

  const roadMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.road,
        roughness: 0.9,
        metalness: 0.05,
      }),
    []
  );

  const kerbMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.roadEdge,
        roughness: 0.85,
        metalness: 0.05,
      }),
    []
  );

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

      {/* Diorama Slab (0.6 thick) */}
      <mesh
        geometry={slabGeometry}
        material={slabMaterials}
        receiveShadow
        castShadow
      />

      {/* Coastal Water */}
      <mesh
        ref={(el) => {
          if (el) waterMaterialRef.current = el.material as THREE.ShaderMaterial;
        }}
        geometry={waterGeometry}
        material={waterMaterial}
        position={[
          bounds.centerX,
          -0.03,
          (promenadeZ + bounds.maxZ) / 2,
        ]}
      />

      {/* Roads ribbon (width 1.1, y 0.02) */}
      {roadGeometry && (
        <mesh
          geometry={roadGeometry}
          material={roadMaterial}
          receiveShadow
        />
      )}

      {/* Kerbs */}
      {kerbGeometry && (
        <mesh
          geometry={kerbGeometry}
          material={kerbMaterial}
          receiveShadow
        />
      )}
    </group>
  );
}
