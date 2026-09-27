"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useGLTF, Outlines } from "@react-three/drei";
import type { StationVM } from "@/lib/graph/viewModel";
import {
  ARCHETYPE_KEYS,
  type ArchetypeKey,
  getStationGeometries,
} from "./stationGeometries";
import { PALETTE } from "./palette";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { useViewStore } from "@/lib/store/useViewStore";

interface StationsProps {
  stations: StationVM[];
}

const _tempObj = new THREE.Object3D();
const _targetColor = new THREE.Color();
const _currentColor = new THREE.Color();

function getArchetypeKey(station: StationVM): ArchetypeKey {
  if (station.kind === "milestone") return "milestone";
  if (station.officeType && ARCHETYPE_KEYS.includes(station.officeType)) {
    return station.officeType;
  }
  return "other";
}

function getStateColorHex(station: StationVM): string {
  if (station.applicability === "may_apply") return PALETTE.undecided;
  switch (station.state) {
    case "done":
      return PALETTE.done;
    case "available":
      return PALETTE.available;
    case "locked":
    default:
      return PALETTE.locked;
  }
}

// Beacon Shader (open cylinder, additive, fading upward)
const BEACON_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const BEACON_FRAGMENT_SHADER = `
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  // Fade upward from 0.18 opacity at base to 0.0 at top
  float fade = pow(1.0 - vUv.y, 2.0);
  gl_FragColor = vec4(uColor, fade * 0.18);
}
`;

export function Stations({ stations }: StationsProps) {
  // Load stations.glb with procedural fallback
  const gltf = useGLTF("/models/stations.glb");
  const fallbackGeometries = useMemo(() => getStationGeometries(), []);

  // Extract geometries from GLB
  const { geometries, atlasMaterial } = useMemo(() => {
    const geomMap = new Map<ArchetypeKey, THREE.BufferGeometry>();
    let material: THREE.MeshStandardMaterial | null = null;

    if (gltf?.scene) {
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (!material && child.material) {
            const mat = child.material as THREE.MeshStandardMaterial;
            if (mat.map) {
              // D1: generateMipmaps = false, LinearFilter
              mat.map.generateMipmaps = false;
              mat.map.minFilter = THREE.LinearFilter;
              mat.map.magFilter = THREE.LinearFilter;
              mat.map.needsUpdate = true;
            }
            material = mat;
          }
          const name = child.name as ArchetypeKey;
          if (ARCHETYPE_KEYS.includes(name)) {
            geomMap.set(name, child.geometry);
          }
        }
      });
    }

    // Fall back to procedural geometry for any missing archetypes
    for (const key of ARCHETYPE_KEYS) {
      if (!geomMap.has(key)) {
        const fallback = fallbackGeometries.get(key);
        if (fallback) geomMap.set(key, fallback);
      }
    }

    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: PALETTE.stationBase,
        roughness: 0.7,
        metalness: 0.1,
      });
    }

    return { geometries: geomMap, atlasMaterial: material };
  }, [gltf, fallbackGeometries]);

  // Group stations by archetype
  const groupedStations = useMemo(() => {
    const groups = new Map<ArchetypeKey, StationVM[]>();
    for (const key of ARCHETYPE_KEYS) {
      groups.set(key, []);
    }
    for (const s of stations) {
      const key = getArchetypeKey(s);
      groups.get(key)?.push(s);
    }
    return groups;
  }, [stations]);

  // Mesh refs
  const meshRefs = useRef<Map<ArchetypeKey, THREE.InstancedMesh>>(new Map());
  const ringMeshRef = useRef<THREE.InstancedMesh>(null);
  const beaconMeshRef = useRef<THREE.InstancedMesh>(null);

  // Available non-optional stations for next-up beacons
  const nextUpStations = useMemo(() => {
    return stations.filter(
      (s) => s.state === "available" && s.applicability !== "optional"
    );
  }, [stations]);

  // Geometries for Plaza Rings and Beacons
  const ringGeometry = useMemo(() => {
    // Plaza ring: RingGeometry(1.25, 1.45, 64)
    const geom = new THREE.RingGeometry(1.25, 1.45, 64);
    geom.rotateX(-Math.PI / 2);
    return geom;
  }, []);

  const beaconGeometry = useMemo(() => {
    // Next-up beacon: open cylinder r=1.2, h=6
    const geom = new THREE.CylinderGeometry(1.2, 1.2, 6, 32, 1, true);
    geom.translate(0, 3, 0); // Base at y = 0
    return geom;
  }, []);

  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    []
  );

  const beaconMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BEACON_VERTEX_SHADER,
        fragmentShader: BEACON_FRAGMENT_SHADER,
        uniforms: {
          uColor: { value: new THREE.Color(PALETTE.available) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    []
  );

  // Animation timing
  const animStartRef = useRef<number | null>(null);
  const animDoneRef = useRef(false);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    animStartRef.current = null;
    animDoneRef.current = prefersReducedMotion;
  }, [stations, prefersReducedMotion]);

  // Frame loop for scale animation and instance transforms
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    if (animStartRef.current === null) {
      animStartRef.current = time;
    }

    const elapsed = time - animStartRef.current;
    let allFinished = true;

    // 1. Update station archetypes
    for (const key of ARCHETYPE_KEYS) {
      const mesh = meshRefs.current.get(key);
      const list = groupedStations.get(key);
      if (!mesh || !list || list.length === 0) continue;

      for (let i = 0; i < list.length; i++) {
        const station = list[i];
        if (!station) continue;

        let scaleY = 1;
        if (!prefersReducedMotion && !animDoneRef.current) {
          const delay = station.layer * 0.12;
          const dt = elapsed - delay;
          if (dt <= 0) {
            scaleY = 0.0001;
            allFinished = false;
          } else if (dt < 0.5) {
            const p = dt / 0.5;
            scaleY = 1 - Math.pow(1 - p, 3);
            allFinished = false;
          } else {
            scaleY = 1;
          }
        }

        const [x, y, z] = station.position3D;
        _tempObj.position.set(x, y, z);
        _tempObj.scale.set(1, scaleY, 1);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.updateMatrix();

        mesh.setMatrixAt(i, _tempObj.matrix);

        // Locked buildings are dimmed with 0.82 grey per visual-direction §3
        if (station.state === "locked") {
          _targetColor.setRGB(0.82, 0.82, 0.82);
        } else {
          _targetColor.setRGB(1.0, 1.0, 1.0);
        }
        mesh.setColorAt(i, _targetColor);
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }

    // 2. Update status rings (toneMapped=false at 1.4x)
    const ringMesh = ringMeshRef.current;
    if (ringMesh && stations.length > 0) {
      for (let i = 0; i < stations.length; i++) {
        const station = stations[i];
        if (!station) continue;

        const [x, , z] = station.position3D;
        _tempObj.position.set(x, 0.03, z);
        _tempObj.scale.set(1, 1, 1);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.updateMatrix();

        ringMesh.setMatrixAt(i, _tempObj.matrix);

        // 1.4x multiplier for bloom per visual-direction §3
        const colorHex = getStateColorHex(station);
        _currentColor.set(colorHex).multiplyScalar(1.4);
        ringMesh.setColorAt(i, _currentColor);
      }

      ringMesh.instanceMatrix.needsUpdate = true;
      if (ringMesh.instanceColor) {
        ringMesh.instanceColor.needsUpdate = true;
      }
    }

    // 3. Update next-up beacons
    const beaconMesh = beaconMeshRef.current;
    if (beaconMesh && nextUpStations.length > 0) {
      for (let i = 0; i < nextUpStations.length; i++) {
        const station = nextUpStations[i];
        if (!station) continue;

        const [x, , z] = station.position3D;
        _tempObj.position.set(x, 0.03, z);
        _tempObj.scale.set(1, 1, 1);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.updateMatrix();

        beaconMesh.setMatrixAt(i, _tempObj.matrix);
      }

      beaconMesh.instanceMatrix.needsUpdate = true;
    }

    if (allFinished) {
      animDoneRef.current = true;
    }
  });

  const hoveredStepId = useViewStore((s) => s.hoveredStepId);
  const selectedStepId = useTaskStore((s) => s.selectedStepId);

  useEffect(() => {
    document.body.style.cursor = hoveredStepId ? "pointer" : "auto";
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hoveredStepId]);

  // Pointer interactions
  const handlePointerOver = (
    e: ThreeEvent<PointerEvent>,
    key: ArchetypeKey
  ) => {
    e.stopPropagation();
    const list = groupedStations.get(key);
    if (list && typeof e.instanceId === "number") {
      const station = list[e.instanceId];
      if (station) {
        useViewStore.getState().setHoveredStepId(station.id);
      }
    }
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useViewStore.getState().setHoveredStepId(null);
  };

  const handleClick = (e: ThreeEvent<MouseEvent>, key: ArchetypeKey) => {
    e.stopPropagation();
    const list = groupedStations.get(key);
    if (list && typeof e.instanceId === "number") {
      const station = list[e.instanceId];
      if (station) {
        useTaskStore.getState().selectStep(station.id);
        useViewStore.getState().setFocusedStepId(station.id);
      }
    }
  };

  // Selected station archetype and geometry for <Outlines>
  const selectedStation = useMemo(() => {
    if (!selectedStepId) return null;
    return stations.find((s) => s.id === selectedStepId) ?? null;
  }, [stations, selectedStepId]);

  const selectedGeometry = useMemo(() => {
    if (!selectedStation) return null;
    const key = getArchetypeKey(selectedStation);
    return geometries.get(key) ?? null;
  }, [selectedStation, geometries]);

  return (
    <group>
      {/* 13 Archetype Instanced Meshes */}
      {ARCHETYPE_KEYS.map((key) => {
        const list = groupedStations.get(key) ?? [];
        const geom = geometries.get(key);
        if (!geom || list.length === 0) return null;

        return (
          <instancedMesh
            key={key}
            ref={(el) => {
              if (el) meshRefs.current.set(key, el);
              else meshRefs.current.delete(key);
            }}
            args={[geom, atlasMaterial, list.length]}
            castShadow
            receiveShadow
            onPointerOver={(e) => handlePointerOver(e, key)}
            onPointerOut={handlePointerOut}
            onClick={(e) => handleClick(e, key)}
          />
        );
      })}

      {/* Instanced Plaza Status Rings */}
      {stations.length > 0 && (
        <instancedMesh
          ref={ringMeshRef}
          args={[ringGeometry, ringMaterial, stations.length]}
        />
      )}

      {/* Instanced Next-Up Beacons */}
      {nextUpStations.length > 0 && (
        <instancedMesh
          ref={beaconMeshRef}
          args={[beaconGeometry, beaconMaterial, nextUpStations.length]}
        />
      )}

      {/* Selected Station Outline (visual-direction §3: plain mesh with drei <Outlines>) */}
      {selectedStation && selectedGeometry && (
        <mesh
          geometry={selectedGeometry}
          position={selectedStation.position3D}
          material={atlasMaterial}
        >
          <Outlines thickness={0.03} color={PALETTE.brand} />
        </mesh>
      )}
    </group>
  );
}

useGLTF.preload("/models/stations.glb");
