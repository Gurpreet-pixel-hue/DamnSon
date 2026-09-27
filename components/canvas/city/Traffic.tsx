"use client";

import { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { CityPlan } from "./planCity";
import type { StationVM } from "@/lib/graph/viewModel";
import type { CarLoop, Waypoint } from "./roadGraph";

interface TrafficProps {
  plan: CityPlan;
  stations: StationVM[];
  stopped?: boolean;
}

const _tempMatrix = new THREE.Matrix4();
const _tempPos = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();
const _tempEuler = new THREE.Euler();
const _whiteColor = new THREE.Color(1, 1, 1);

const MOVING_CAR_KINDS = [
  "sedan",
  "taxi",
  "van",
  "suv",
  "hatchback-sports",
  "delivery",
  "truck",
  "garbage-truck",
] as const;

interface CarState {
  loopIndex: number;
  progress: number; // distance along loop in world units
  speed: number; // units/sec
  kind: string;
  isPaused: boolean;
  pauseTimer: number;
  pauseDuration: number;
}

interface ParkedVehicle {
  kind: string;
  position: [number, number, number];
  rotationY: number;
}

export function Traffic({ plan, stations, stopped = false }: TrafficProps) {
  const gltf = useGLTF("/models/cars.glb");
  const containerRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.BatchedMesh | null>(null);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const loops: CarLoop[] = useMemo(() => plan.roadGraph?.carLoops ?? [], [plan.roadGraph]);

  // 1. Compute Parked Service Vehicles (§10.3)
  // firetruck at fire_services, police at police, ambulance at health_department
  const parkedVehicles = useMemo<ParkedVehicle[]>(() => {
    const list: ParkedVehicle[] = [];
    for (const s of stations) {
      const kind =
        s.officeType === "fire_services"
          ? "firetruck"
          : s.officeType === "police"
          ? "police"
          : s.officeType === "health_department"
          ? "ambulance"
          : null;

      if (!kind) continue;

      // Park at edge of station plaza (radius 1.6) facing road
      const [sx, , sz] = s.position3D;
      list.push({
        kind,
        position: [sx + 1.25, 0.17, sz + 1.25],
        rotationY: Math.PI / 4,
      });
    }
    return list;
  }, [stations]);

  // 2. Setup 24–36 Moving Cars across loops (§10.3)
  const carsState = useRef<CarState[]>([]);

  useEffect(() => {
    if (loops.length === 0) return;

    const TARGET_MOVING_CARS = 28;
    const states: CarState[] = [];

    for (let i = 0; i < TARGET_MOVING_CARS; i++) {
      const loopIdx = i % loops.length;
      const loop = loops[loopIdx]!;
      // Space cars on the same loop evenly to avoid collisions
      const carsOnThisLoop = Math.ceil(TARGET_MOVING_CARS / loops.length);
      const slotIndex = Math.floor(i / loops.length);
      const initialProgress = (slotIndex / carsOnThisLoop) * loop.length;

      const kind = MOVING_CAR_KINDS[i % MOVING_CAR_KINDS.length]!;
      const speed = 1.3 + (i % 5) * 0.14; // 1.3 to 1.86 units/s (within 1.2 - 2.0 range)

      states.push({
        loopIndex: loopIdx,
        progress: initialProgress,
        speed,
        kind,
        isPaused: false,
        pauseTimer: 0,
        pauseDuration: 0.6 + (i % 3) * 0.25,
      });
    }

    carsState.current = states;
  }, [loops]);

  // 3. BatchedMesh for all cars (+1 draw)
  const { batchedMesh, instanceIndices } = useMemo(() => {
    if (!gltf?.scene) return { batchedMesh: null, instanceIndices: [] };

    const gMap = new Map<string, THREE.BufferGeometry>();
    let atlasMaterial: THREE.MeshStandardMaterial | null = null;

    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!atlasMaterial && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.map) {
            mat.map.generateMipmaps = false;
            mat.map.minFilter = THREE.LinearFilter;
            mat.map.magFilter = THREE.LinearFilter;
            mat.map.needsUpdate = true;
          }
          atlasMaterial = mat;
        }
        if (!gMap.has(child.name)) {
          gMap.set(child.name, child.geometry);
        }
      }
    });

    if (!atlasMaterial || gMap.size === 0) {
      return { batchedMesh: null, geomIdMap: new Map(), instanceIndices: [] };
    }

    const movingCount = 28;
    const parkedCount = parkedVehicles.length;
    const totalCount = Math.max(1, movingCount + parkedCount);

    let maxVerts = 0;
    let maxIndices = 0;
    for (const geom of gMap.values()) {
      const v = geom.getAttribute("position")?.count ?? 0;
      const idx = geom.getIndex()?.count ?? v;
      maxVerts += v;
      maxIndices += idx;
    }

    const totalMaxVerts = Math.max(30000, maxVerts * totalCount);
    const totalMaxIndices = Math.max(45000, maxIndices * totalCount);

    const bMesh = new THREE.BatchedMesh(
      totalCount,
      totalMaxVerts,
      totalMaxIndices,
      atlasMaterial
    );
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    bMesh.raycast = () => {};

    const idMap = new Map<string, number>();
    for (const [name, geom] of gMap.entries()) {
      const gId = bMesh.addGeometry(geom);
      idMap.set(name, gId);
    }

    const instIdxs: number[] = [];

    // Register moving car instances
    for (let i = 0; i < movingCount; i++) {
      const kind = MOVING_CAR_KINDS[i % MOVING_CAR_KINDS.length]!;
      let gId = idMap.get(kind);
      if (gId === undefined) gId = idMap.values().next().value;
      if (gId !== undefined) {
        const instId = bMesh.addInstance(gId);
        instIdxs.push(instId);
        bMesh.setColorAt(instId, _whiteColor);
      }
    }

    // Register parked vehicle instances
    for (const pv of parkedVehicles) {
      let gId = idMap.get(pv.kind);
      if (gId === undefined) gId = idMap.values().next().value;
      if (gId !== undefined) {
        const instId = bMesh.addInstance(gId);
        _tempPos.set(pv.position[0], pv.position[1], pv.position[2]);
        _tempEuler.set(0, pv.rotationY, 0);
        _tempQuat.setFromEuler(_tempEuler);
        _tempScale.set(0.5, 0.5, 0.5);
        _tempMatrix.compose(_tempPos, _tempQuat, _tempScale);

        bMesh.setMatrixAt(instId, _tempMatrix);
        bMesh.setColorAt(instId, _whiteColor);
      }
    }

    return { batchedMesh: bMesh, geomIdMap: idMap, instanceIndices: instIdxs };
  }, [gltf, parkedVehicles]);

  useEffect(() => {
    const group = containerRef.current;
    if (group && batchedMesh) {
      group.clear();
      group.add(batchedMesh);
      meshRef.current = batchedMesh;
    }
  }, [batchedMesh]);

  // Helper to interpolate position and heading along loop waypoints
  const sampleLoop = (
    loop: CarLoop,
    dist: number,
    outPos: THREE.Vector3,
    outEuler: THREE.Euler
  ) => {
    const wps = loop.waypoints;
    const totalLen = loop.length;
    const targetDist = ((dist % totalLen) + totalLen) % totalLen;

    let accumulated = 0;
    for (let i = 0; i < wps.length; i++) {
      const p1: Waypoint = wps[i]!;
      const p2: Waypoint = wps[(i + 1) % wps.length]!;
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);

      if (accumulated + segLen >= targetDist || i === wps.length - 1) {
        const segProgress = (targetDist - accumulated) / Math.max(0.0001, segLen);
        const x = p1.x + segProgress * (p2.x - p1.x);
        const z = p1.z + segProgress * (p2.z - p1.z);
        outPos.set(x, 0.17, z);

        // Heading angle facing forward along the segment
        const angle = Math.atan2(p2.x - p1.x, p2.z - p1.z);
        outEuler.set(0, angle, 0);
        return;
      }
      accumulated += segLen;
    }
  };

  // 4. Animation loop: allocation-free, pauses on document.hidden or stopped (§10.3)
  useFrame((_, delta) => {
    const bMesh = meshRef.current;
    if (!bMesh || loops.length === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;

    const states = carsState.current;
    const isStationary = prefersReducedMotion || stopped;

    for (let i = 0; i < states.length && i < instanceIndices.length; i++) {
      const car = states[i]!;
      const instId = instanceIndices[i]!;
      const loop = loops[car.loopIndex % loops.length]!;

      if (!isStationary) {
        // Handle pause at intersections
        if (car.isPaused) {
          car.pauseTimer += delta;
          if (car.pauseTimer >= car.pauseDuration) {
            car.isPaused = false;
            car.pauseTimer = 0;
          }
        } else {
          // Advance progress
          car.progress += car.speed * delta;
          // Trigger occasional pause at corner/intersection
          const wpSpacing = loop.length / loop.waypoints.length;
          const nearWp = (car.progress % wpSpacing) < car.speed * delta;
          if (nearWp && (Math.floor(car.progress / wpSpacing) % 4 === 0)) {
            car.isPaused = true;
          }
        }
      }

      sampleLoop(loop, car.progress, _tempPos, _tempEuler);
      _tempQuat.setFromEuler(_tempEuler);
      _tempScale.set(0.5, 0.5, 0.5); // uniform scale for car instances
      _tempMatrix.compose(_tempPos, _tempQuat, _tempScale);

      bMesh.setMatrixAt(instId, _tempMatrix);
    }
  });

  return <group ref={containerRef} />;
}

useGLTF.preload("/models/cars.glb");
