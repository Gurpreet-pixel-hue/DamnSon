"use client";

import { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { CityPlan } from "./planCity";

import { POLYGON_OFFSETS } from "../heights";

interface RoadsProps {
  plan: CityPlan;
}

const _tempMatrix = new THREE.Matrix4();
const _tempPos = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();
const _tempEuler = new THREE.Euler();
const _whiteColor = new THREE.Color(1, 1, 1);

export function Roads({ plan }: RoadsProps) {
  const gltf = useGLTF("/models/roads.glb");
  const containerRef = useRef<THREE.Group>(null);

  const batchedMesh = useMemo(() => {
    if (!gltf?.scene || plan.roads.length === 0) return null;

    const geomMap = new Map<string, THREE.BufferGeometry>();
    let atlasMaterial: THREE.MeshStandardMaterial | null = null;

    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!atlasMaterial && child.material) {
          const mat = (child.material as THREE.MeshStandardMaterial).clone();
          if (mat.map) {
            mat.map.generateMipmaps = false;
            mat.map.minFilter = THREE.LinearFilter;
            mat.map.magFilter = THREE.LinearFilter;
            mat.map.needsUpdate = true;
          }
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = POLYGON_OFFSETS.road.factor;
          mat.polygonOffsetUnits = POLYGON_OFFSETS.road.units;
          atlasMaterial = mat;
        }
        if (!geomMap.has(child.name)) {
          geomMap.set(child.name, child.geometry);
        }
      }
    });

    if (!atlasMaterial || geomMap.size === 0) return null;

    let maxVerts = 0;
    let maxIndices = 0;
    for (const geom of geomMap.values()) {
      const vCount = geom.getAttribute("position")?.count ?? 0;
      const iCount = geom.getIndex()?.count ?? vCount;
      maxVerts += vCount;
      maxIndices += iCount;
    }

    const instanceCount = Math.max(1, plan.roads.length);
    const totalMaxVerts = Math.max(10000, maxVerts * instanceCount);
    const totalMaxIndices = Math.max(16000, maxIndices * instanceCount);

    const bMesh = new THREE.BatchedMesh(
      instanceCount,
      totalMaxVerts,
      totalMaxIndices,
      atlasMaterial
    );
    bMesh.receiveShadow = true;
    bMesh.raycast = () => {}; // Disabled raycast per visual-direction §3

    const geomIdMap = new Map<string, number>();
    for (const [name, geom] of geomMap.entries()) {
      const gId = bMesh.addGeometry(geom);
      geomIdMap.set(name, gId);
    }

    for (const r of plan.roads) {
      let gId = geomIdMap.get(r.kind);
      if (gId === undefined) gId = geomIdMap.values().next().value;
      if (gId === undefined) continue;

      const instId = bMesh.addInstance(gId);
      _tempPos.set(r.position[0], r.position[1], r.position[2]);
      _tempEuler.set(0, r.rotationY, 0);
      _tempQuat.setFromEuler(_tempEuler);
      _tempScale.set(r.scale[0], r.scale[1], r.scale[2]);
      _tempMatrix.compose(_tempPos, _tempQuat, _tempScale);

      bMesh.setMatrixAt(instId, _tempMatrix);
      bMesh.setColorAt(instId, _whiteColor);
    }

    return bMesh;
  }, [gltf, plan.roads]);

  useEffect(() => {
    const group = containerRef.current;
    if (group && batchedMesh) {
      group.clear();
      group.add(batchedMesh);
    }
  }, [batchedMesh]);

  return <group ref={containerRef} />;
}

useGLTF.preload("/models/roads.glb");
