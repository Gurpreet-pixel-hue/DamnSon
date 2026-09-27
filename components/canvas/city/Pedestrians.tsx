"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { CityPlan } from "./planCity";
import type { StationVM } from "@/lib/graph/viewModel";

interface PedestriansProps {
  plan: CityPlan;
  stations: StationVM[];
  stopped?: boolean;
}

const _tempObj = new THREE.Object3D();
const _tempColor = new THREE.Color();

const PALETTE_CLOTHING = [
  "#1F63D6", // Blue
  "#D97706", // Amber
  "#0D9488", // Teal
  "#4B5563", // Slate
  "#DC2626", // Red
  "#7C3AED", // Violet
];

interface WalkerState {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  speed: number;
  phase: number;
}

interface QueuerState {
  baseX: number;
  baseY: number;
  baseZ: number;
  rotationY: number;
  swayPhase: number;
}

export function Pedestrians({ plan, stations, stopped = false }: PedestriansProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // 1. Procedural Figure Geometry (≤ 60 triangles per §10.4: box body + octahedron head = 20 tris)
  const figureGeometry = useMemo(() => {
    const body = new THREE.BoxGeometry(0.16, 0.30, 0.12);
    body.translate(0, 0.15, 0); // Base at y = 0, top at y = 0.30

    const head = new THREE.OctahedronGeometry(0.08, 0);
    head.translate(0, 0.38, 0); // Head centered at y = 0.38

    // Merge into single non-indexed or indexed BufferGeometry
    const bPos = body.getAttribute("position");
    const bNorm = body.getAttribute("normal");
    const hPos = head.getAttribute("position");
    const hNorm = head.getAttribute("normal");

    const totalVerts = (bPos?.count ?? 0) + (hPos?.count ?? 0);
    const posArr = new Float32Array(totalVerts * 3);
    const normArr = new Float32Array(totalVerts * 3);

    let offset = 0;
    if (bPos && bNorm) {
      posArr.set(bPos.array, offset);
      normArr.set(bNorm.array, offset);
      offset += bPos.count * 3;
    }
    if (hPos && hNorm) {
      posArr.set(hPos.array, offset);
      normArr.set(hNorm.array, offset);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geom.setAttribute("normal", new THREE.BufferAttribute(normArr, 3));
    return geom;
  }, []);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.8,
        metalness: 0.1,
      }),
    []
  );

  // 2. Compute Queues (3–5 people at in-person or hybrid station door per §10.4)
  const queuers = useMemo<QueuerState[]>(() => {
    const list: QueuerState[] = [];

    for (const s of stations) {
      // In-person or hybrid stations get queues
      const isOffice = s.officeType !== "online_portal" && s.kind !== "milestone";
      if (!isOffice) continue;

      const [sx, , sz] = s.position3D;
      const count = 4; // decorative queue of 4 people

      // Queue lines up approaching plaza entrance
      for (let i = 0; i < count; i++) {
        const offsetDist = 1.35 + i * 0.28;
        list.push({
          baseX: sx + offsetDist * 0.7,
          baseY: 0.19, // Sitting on plaza pad
          baseZ: sz + offsetDist * 0.7,
          rotationY: (5 * Math.PI) / 4, // Facing toward station center
          swayPhase: (i * 1.3) % (Math.PI * 2),
        });
      }
    }

    return list;
  }, [stations]);

  // 3. Compute Walkers (60–100 walking along pavements per §10.4)
  const walkers = useMemo<WalkerState[]>(() => {
    const list: WalkerState[] = [];
    const roadCells = plan.roadGraph?.roadCells ?? [];
    if (roadCells.length === 0) return list;

    const TARGET_WALKERS = 72; // within 60–100 budget
    const { cellSize } = plan.cellGrid;

    for (let i = 0; i < TARGET_WALKERS; i++) {
      const cell = roadCells[i % roadCells.length]!;
      const [cx, , cz] = cell.position;

      // Pavement offset along North/South or East/West edge
      const isEastWest = cell.neighbours.east || cell.neighbours.west;
      let startX: number, startZ: number, endX: number, endZ: number;

      if (isEastWest) {
        // Walk along North pavement of street
        startX = cx - cellSize * 0.45;
        endX = cx + cellSize * 0.45;
        startZ = cz - 0.70;
        endZ = cz - 0.70;
      } else {
        // Walk along West pavement of street
        startX = cx - 0.70;
        endX = cx - 0.70;
        startZ = cz - cellSize * 0.45;
        endZ = cz + cellSize * 0.45;
      }

      list.push({
        startX,
        startZ,
        endX,
        endZ,
        phase: (i * 0.73) % 10,
        speed: 0.45 + (i % 4) * 0.06, // 0.45–0.63 units/s
      });
    }

    return list;
  }, [plan.roadGraph, plan.cellGrid]);

  const totalInstances = queuers.length + walkers.length;

  // Set instance colors on mount
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < totalInstances; i++) {
      const colorHex = PALETTE_CLOTHING[i % PALETTE_CLOTHING.length]!;
      _tempColor.set(colorHex);
      mesh.setColorAt(i, _tempColor);
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [totalInstances]);

  // 4. Animation loop: allocation-free useFrame (§10.4)
  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (typeof document !== "undefined" && document.hidden) return;

    const time = state.clock.getElapsedTime();
    let idx = 0;

    // A. Render Queuers (stationary, gentle idle sway unless reduced motion)
    for (const q of queuers) {
      const swayX = prefersReducedMotion ? 0 : Math.sin(time * 2.2 + q.swayPhase) * 0.008;
      const swayY = prefersReducedMotion ? 0 : Math.abs(Math.sin(time * 3.5 + q.swayPhase)) * 0.004;

      _tempObj.position.set(q.baseX + swayX, q.baseY + swayY, q.baseZ);
      _tempObj.rotation.set(0, q.rotationY, 0);
      _tempObj.scale.set(1, 1, 1);
      _tempObj.updateMatrix();

      mesh.setMatrixAt(idx++, _tempObj.matrix);
    }

    // B. Render Walkers (hidden under reduced motion; walking back-and-forth)
    const hideWalkers = prefersReducedMotion || stopped;
    for (const w of walkers) {
      if (hideWalkers) {
        _tempObj.position.set(0, -100, 0);
        _tempObj.scale.set(0, 0, 0);
        _tempObj.updateMatrix();
        mesh.setMatrixAt(idx++, _tempObj.matrix);
        continue;
      }

      // Analytical progress along segment (0 to 1 and back) without mutating state
      const segLen = Math.hypot(w.endX - w.startX, w.endZ - w.startZ);
      const cycleTime = Math.max(0.1, (2 * segLen) / w.speed);
      const cycleProgress = ((time + w.phase) % cycleTime) / cycleTime;
      const forward = cycleProgress < 0.5;
      const p = forward ? cycleProgress * 2 : (1 - cycleProgress) * 2;

      const x = w.startX + p * (w.endX - w.startX);
      const z = w.startZ + p * (w.endZ - w.startZ);
      const heading = forward
        ? Math.atan2(w.endX - w.startX, w.endZ - w.startZ)
        : Math.atan2(w.startX - w.endX, w.startZ - w.endZ);

      // Subtle walking bounce
      const bounceY = Math.abs(Math.sin(time * 8 + w.phase)) * 0.012;

      _tempObj.position.set(x, 0.17 + bounceY, z);
      _tempObj.rotation.set(0, heading, 0);
      _tempObj.scale.set(1, 1, 1);
      _tempObj.updateMatrix();

      mesh.setMatrixAt(idx++, _tempObj.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (totalInstances === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[figureGeometry, material, totalInstances]}
      castShadow
      receiveShadow
    />
  );
}
