"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
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

// Module-level temporary objects to avoid allocations in useFrame
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

export function Stations({ stations }: StationsProps) {
  const geometries = useMemo(() => getStationGeometries(), []);

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

  // Animation timing
  const animStartRef = useRef<number | null>(null);
  const animDoneRef = useRef(false);

  // Status ring geometry
  const ringGeometry = useMemo(() => {
    const geom = new THREE.RingGeometry(0.95, 1.1, 48);
    geom.rotateX(-Math.PI / 2);
    return geom;
  }, []);

  // Shared materials
  const stationMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.stationBase,
        roughness: 0.7,
        metalness: 0.1,
      }),
    []
  );

  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    []
  );

  // Detect reduced motion
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Check initial layout & setup
  useEffect(() => {
    animStartRef.current = null;
    animDoneRef.current = prefersReducedMotion;
  }, [stations, prefersReducedMotion]);

  // Initial and reactive matrix/color setup
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
            scaleY = 1 - Math.pow(1 - p, 3); // easeOutCubic
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

        // Instance color
        const colorHex = getStateColorHex(station);
        _targetColor.set(colorHex);
        mesh.setColorAt(i, _targetColor);
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }

    // 2. Update status rings
    const ringMesh = ringMeshRef.current;
    if (ringMesh && stations.length > 0) {
      for (let i = 0; i < stations.length; i++) {
        const station = stations[i];
        if (!station) continue;

        const [x, , z] = station.position3D;
        _tempObj.position.set(x, 0.02, z);
        _tempObj.scale.set(1, 1, 1);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.updateMatrix();

        ringMesh.setMatrixAt(i, _tempObj.matrix);

        // 1.5x bloom intensity for rings
        const colorHex = getStateColorHex(station);
        _currentColor.set(colorHex).multiplyScalar(1.5);
        ringMesh.setColorAt(i, _currentColor);
      }

      ringMesh.instanceMatrix.needsUpdate = true;
      if (ringMesh.instanceColor) {
        ringMesh.instanceColor.needsUpdate = true;
      }
    }

    if (allFinished) {
      animDoneRef.current = true;
    }
  });

  const hoveredStepId = useViewStore((s) => s.hoveredStepId);
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
            args={[geom, stationMaterial, list.length]}
            castShadow
            receiveShadow
            onPointerOver={(e) => handlePointerOver(e, key)}
            onPointerOut={handlePointerOut}
            onClick={(e) => handleClick(e, key)}
          />
        );
      })}

      {/* Instanced Status Rings */}
      {stations.length > 0 && (
        <instancedMesh
          ref={ringMeshRef}
          args={[ringGeometry, ringMaterial, stations.length]}
        />
      )}
    </group>
  );
}
