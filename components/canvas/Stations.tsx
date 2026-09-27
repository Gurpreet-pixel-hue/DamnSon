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
import { HEIGHTS, PLAZA_PAD_CENTER_Y, POLYGON_OFFSETS } from "./heights";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { useViewStore, requestHover } from "@/lib/store/useViewStore";

interface StationsProps {
  stations: StationVM[];
}

const _tempObj = new THREE.Object3D();
const _scratchColor = new THREE.Color();
const _scratchBase = new THREE.Color();
const _scratchPaper = new THREE.Color(PALETTE.background);

function getArchetypeKey(station: StationVM): ArchetypeKey {
  if (station.kind === "milestone") return "milestone";
  if (station.mode === "online" || station.officeType === "online_portal") {
    return "online_portal";
  }
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
  const padMeshRef = useRef<THREE.InstancedMesh>(null);
  const ringMeshRef = useRef<THREE.InstancedMesh>(null);
  const beaconMeshRef = useRef<THREE.InstancedMesh>(null);
  const hybridMeshRef = useRef<THREE.InstancedMesh>(null);
  const checkDiscMeshRef = useRef<THREE.InstancedMesh>(null);

  const focusStage = useViewStore((s) => s.focusStage);

  // Available non-optional stations in focused stage for next-up beacons (§11.2)
  const nextUpStations = useMemo(() => {
    return stations.filter(
      (s) =>
        s.layer === focusStage - 1 &&
        s.state === "available" &&
        s.applicability !== "optional"
    );
  }, [stations, focusStage]);

  // Done stations for 3D green check discs on the plaza (§11.2)
  const doneStations = useMemo(() => {
    return stations.filter((s) => s.state === "done");
  }, [stations]);

  // Hybrid stations for floating roof screen (§10.5)
  const hybridStations = useMemo(() => {
    return stations.filter((s) => s.mode === "hybrid");
  }, [stations]);

  // Geometries for Plaza Pads, Plaza Rings, Beacons, and Check Discs
  const padGeometry = useMemo(() => {
    // E9: Plaza pad (plaza colour, radius 1.6, 0.04 high)
    return new THREE.CylinderGeometry(1.6, 1.6, 0.04, 32);
  }, []);

  const padMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.plaza,
        roughness: 0.9,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.plazaPad.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.plazaPad.units,
      }),
    []
  );

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

  // 3D green check disc decal on plaza for done stations (§11.2)
  const checkDiscGeometry = useMemo(() => {
    const geom = new THREE.CircleGeometry(0.35, 32);
    geom.rotateX(-Math.PI / 2);
    return geom;
  }, []);

  const checkDiscMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.done,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.ringsAndDecals.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.ringsAndDecals.units,
      }),
    []
  );

  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        toneMapped: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSETS.ringsAndDecals.factor,
        polygonOffsetUnits: POLYGON_OFFSETS.ringsAndDecals.units,
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

  // Floating screen for hybrid stations (§10.5)
  const hybridScreenGeometry = useMemo(() => new THREE.BoxGeometry(0.8, 0.5, 0.08), []);
  const hybridScreenMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.available,
        emissive: PALETTE.available,
        emissiveIntensity: 0.5,
        roughness: 0.5,
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

  // Track previous station states to trigger 0.6s unlock pop when becoming available (§10.7)
  const prevStatesRef = useRef<Map<string, string>>(new Map());
  const unlockTimesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (prevStatesRef.current.size > 0) {
      const now = performance.now() / 1000;
      for (const station of stations) {
        const prevState = prevStatesRef.current.get(station.id);
        if (prevState === "locked" && station.state === "available") {
          unlockTimesRef.current.set(station.id, now);
        }
      }
    }
    const newMap = new Map<string, string>();
    for (const station of stations) {
      newMap.set(station.id, station.state);
    }
    prevStatesRef.current = newMap;
  }, [stations, prefersReducedMotion]);

  useEffect(() => {
    animStartRef.current = null;
    animDoneRef.current = prefersReducedMotion;
  }, [stations, prefersReducedMotion]);

  // Update instance colors only when stations or focusStage change (§11.2, AGENTS rule)
  useEffect(() => {
    // 1. Station building colors
    for (const key of ARCHETYPE_KEYS) {
      const mesh = meshRefs.current.get(key);
      const list = groupedStations.get(key);
      if (!mesh || !list || list.length === 0) continue;

      for (let i = 0; i < list.length; i++) {
        const station = list[i];
        if (!station) continue;

        const isFocusedStage = station.layer === focusStage - 1;
        if (isFocusedStage) {
          if (station.state === "locked") {
            _scratchColor.setRGB(0.75, 0.75, 0.75);
          } else {
            _scratchColor.setRGB(1.0, 1.0, 1.0);
          }
        } else {
          if (station.state === "locked") {
            _scratchBase.setRGB(0.75, 0.75, 0.75);
          } else {
            _scratchBase.setRGB(1.0, 1.0, 1.0);
          }
          _scratchColor.copy(_scratchBase).lerp(_scratchPaper, 0.4);
        }
        mesh.setColorAt(i, _scratchColor);
      }

      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }

    // 2. Status rings colors (§11.2):
    // Focused stage: state colour x 1.4
    // Outside focused stage: lerp state colour 60 % toward --cw-paper, without the 1.4 multiplier
    const ringMesh = ringMeshRef.current;
    if (ringMesh && stations.length > 0) {
      for (let i = 0; i < stations.length; i++) {
        const station = stations[i];
        if (!station) continue;

        const isFocusedStage = station.layer === focusStage - 1;
        const colorHex = getStateColorHex(station);

        if (isFocusedStage) {
          _scratchColor.set(colorHex).multiplyScalar(1.4);
        } else {
          _scratchBase.set(colorHex);
          _scratchColor.copy(_scratchBase).lerp(_scratchPaper, 0.6);
        }
        ringMesh.setColorAt(i, _scratchColor);
      }

      if (ringMesh.instanceColor) {
        ringMesh.instanceColor.needsUpdate = true;
      }
    }
  }, [stations, groupedStations, focusStage]);

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

        let popScale = 1.0;
        const unlockTime = unlockTimesRef.current.get(station.id);
        if (unlockTime !== undefined && !prefersReducedMotion) {
          const dt = performance.now() / 1000 - unlockTime;
          if (dt < 0.6) {
            const p = dt / 0.6;
            // 0.6s unlock pop: scale 1 -> 1.12 -> 1
            popScale = 1.0 + Math.sin(p * Math.PI) * 0.12;
            allFinished = false;
          } else {
            unlockTimesRef.current.delete(station.id);
          }
        }

        const [x, , z] = station.position3D;
        const bob =
          key === "online_portal" && !prefersReducedMotion
            ? Math.sin((time * Math.PI * 2) / 3.0) * 0.08
            : 0;
        _tempObj.position.set(x, 0.21 + bob, z);
        // G3: Stations render at 1.25x scale + unlock pop (§10.7)
        _tempObj.scale.set(1.25 * popScale, 1.25 * scaleY * popScale, 1.25 * popScale);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.updateMatrix();

        mesh.setMatrixAt(i, _tempObj.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
    }

    // 1b. Update plaza pads (E9: plaza colour, radius 1.6, 0.04 high)
    const padMesh = padMeshRef.current;
    if (padMesh && stations.length > 0) {
      for (let i = 0; i < stations.length; i++) {
        const station = stations[i];
        if (!station) continue;

        const [x, , z] = station.position3D;
        _tempObj.position.set(x, PLAZA_PAD_CENTER_Y, z); // Pad center at 0.190 -> top is 0.210 (§11.5)
        _tempObj.scale.set(1, 1, 1);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.updateMatrix();

        padMesh.setMatrixAt(i, _tempObj.matrix);
      }
      padMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Update status rings (sitting on plaza pad at y = 0.225 per §11.5)
    const ringMesh = ringMeshRef.current;
    if (ringMesh && stations.length > 0) {
      for (let i = 0; i < stations.length; i++) {
        const station = stations[i];
        if (!station) continue;

        const [x, , z] = station.position3D;
        _tempObj.position.set(x, HEIGHTS.ringsAndDecals, z);
        _tempObj.scale.set(1, 1, 1);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.updateMatrix();

        ringMesh.setMatrixAt(i, _tempObj.matrix);
      }

      ringMesh.instanceMatrix.needsUpdate = true;
    }

    // 3. Update next-up beacons (sitting on plaza pad at y = 0.225 per §11.5)
    const beaconMesh = beaconMeshRef.current;
    if (beaconMesh && nextUpStations.length > 0) {
      for (let i = 0; i < nextUpStations.length; i++) {
        const station = nextUpStations[i];
        if (!station) continue;

        const [x, , z] = station.position3D;
        _tempObj.position.set(x, HEIGHTS.ringsAndDecals, z);
        _tempObj.scale.set(1, 1, 1);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.updateMatrix();

        beaconMesh.setMatrixAt(i, _tempObj.matrix);
      }

      beaconMesh.instanceMatrix.needsUpdate = true;
    }

    // 4. Update hybrid floating roof screens (§10.5)
    const hybridMesh = hybridMeshRef.current;
    if (hybridMesh && hybridStations.length > 0) {
      for (let i = 0; i < hybridStations.length; i++) {
        const station = hybridStations[i];
        if (!station) continue;

        const [x, , z] = station.position3D;
        const bob = !prefersReducedMotion ? Math.sin((time * Math.PI * 2) / 3.0) * 0.05 : 0;
        _tempObj.position.set(x, 2.75 + bob, z);
        _tempObj.scale.set(1, 1, 1);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.updateMatrix();

        hybridMesh.setMatrixAt(i, _tempObj.matrix);
      }
      hybridMesh.instanceMatrix.needsUpdate = true;
    }

    // 5. Update done station check discs on the plaza (§11.2)
    const checkMesh = checkDiscMeshRef.current;
    if (checkMesh && doneStations.length > 0) {
      for (let i = 0; i < doneStations.length; i++) {
        const station = doneStations[i];
        if (!station) continue;

        const [x, , z] = station.position3D;
        _tempObj.position.set(x, HEIGHTS.ringsAndDecals, z + 0.8);
        _tempObj.scale.set(1, 1, 1);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.updateMatrix();

        checkMesh.setMatrixAt(i, _tempObj.matrix);
      }
      checkMesh.instanceMatrix.needsUpdate = true;
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
        requestHover(station.id);
      }
    }
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    requestHover(null);
  };

  const handleClick = (e: ThreeEvent<MouseEvent>, key: ArchetypeKey) => {
    e.stopPropagation();
    const list = groupedStations.get(key);
    if (list && typeof e.instanceId === "number") {
      const station = list[e.instanceId];
      if (station) {
        useTaskStore.getState().selectStep(station.id);
        useViewStore.getState().setFocusedStepId(station.id);
        useViewStore.getState().setFocusStage(station.layer + 1);
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

      {/* Instanced Plaza Pads (plaza colour, radius 1.6, 0.04 high per E9) */}
      {stations.length > 0 && (
        <instancedMesh
          ref={padMeshRef}
          args={[padGeometry, padMaterial, stations.length]}
          receiveShadow
          onPointerOver={(e) => {
            e.stopPropagation();
            if (typeof e.instanceId === "number") {
              const station = stations[e.instanceId];
              if (station) requestHover(station.id);
            }
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            requestHover(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (typeof e.instanceId === "number") {
              const station = stations[e.instanceId];
              if (station) {
                useTaskStore.getState().selectStep(station.id);
                useViewStore.getState().setFocusedStepId(station.id);
                useViewStore.getState().setFocusStage(station.layer + 1);
              }
            }
          }}
        />
      )}

      {/* Instanced Plaza Status Rings */}
      {stations.length > 0 && (
        <instancedMesh
          ref={ringMeshRef}
          args={[ringGeometry, ringMaterial, stations.length]}
        />
      )}

      {/* 3D Green Check Discs on Plaza for Done Stations (§11.2) */}
      {doneStations.length > 0 && (
        <instancedMesh
          ref={checkDiscMeshRef}
          args={[checkDiscGeometry, checkDiscMaterial, doneStations.length]}
        />
      )}

      {/* Instanced Next-Up Beacons */}
      {nextUpStations.length > 0 && (
        <instancedMesh
          ref={beaconMeshRef}
          args={[beaconGeometry, beaconMaterial, nextUpStations.length]}
        />
      )}

      {/* Instanced Hybrid Roof Screens (§10.5) */}
      {hybridStations.length > 0 && (
        <instancedMesh
          ref={hybridMeshRef}
          args={[hybridScreenGeometry, hybridScreenMaterial, hybridStations.length]}
        />
      )}

      {/* Selected Station Outline (visual-direction §3: plain mesh with drei <Outlines>) */}
      {selectedStation && selectedGeometry && (
        <mesh
          geometry={selectedGeometry}
          position={[
            selectedStation.position3D[0],
            0.21,
            selectedStation.position3D[2],
          ]}
          scale={[1.25, 1.25, 1.25]}
          material={atlasMaterial}
        >
          <Outlines thickness={0.03} color={PALETTE.brand} />
        </mesh>
      )}
    </group>
  );
}

useGLTF.preload("/models/stations.glb");
