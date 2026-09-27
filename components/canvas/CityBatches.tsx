"use client";

import { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { CityPlan } from "./city/planCity";

interface CityBatchesProps {
  plan: CityPlan;
  visibleProps?: boolean;
}

const _tempMatrix = new THREE.Matrix4();
const _tempPos = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();
const _tempEuler = new THREE.Euler();
const _whiteColor = new THREE.Color(1, 1, 1);

export function CityBatches({ plan, visibleProps = true }: CityBatchesProps) {
  // Preload and load city and props models
  const cityGltf = useGLTF("/models/city.glb");
  const propsGltf = useGLTF("/models/props.glb");

  const cityContainerRef = useRef<THREE.Group>(null);
  const propsContainerRef = useRef<THREE.Group>(null);

  // 1. Build BatchedMesh for Buildings
  const cityBatchedMesh = useMemo(() => {
    if (!cityGltf?.scene) return null;

    // Collect unique geometries and extract material
    const geomMap = new Map<string, THREE.BufferGeometry>();
    let atlasMaterial: THREE.MeshStandardMaterial | null = null;

    cityGltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!atlasMaterial && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.map) {
            // D1: generateMipmaps = false, LinearFilter
            mat.map.generateMipmaps = false;
            mat.map.minFilter = THREE.LinearFilter;
            mat.map.magFilter = THREE.LinearFilter;
            mat.map.needsUpdate = true;
          }
          atlasMaterial = mat;
        }
        if (!geomMap.has(child.name)) {
          geomMap.set(child.name, child.geometry);
        }
      }
    });

    if (!atlasMaterial || geomMap.size === 0) return null;

    // Calculate maximum vertices and indices
    let maxVerts = 0;
    let maxIndices = 0;
    for (const geom of geomMap.values()) {
      const vCount = geom.getAttribute("position")?.count ?? 0;
      const iCount = geom.getIndex()?.count ?? vCount;
      maxVerts += vCount;
      maxIndices += iCount;
    }

    const instanceCount = Math.max(1, plan.buildings.length);
    // Multiply by max repetitions safely
    const totalMaxVerts = Math.max(100000, maxVerts * 20);
    const totalMaxIndices = Math.max(160000, maxIndices * 20);

    const batchedMesh = new THREE.BatchedMesh(
      instanceCount,
      totalMaxVerts,
      totalMaxIndices,
      atlasMaterial
    );
    batchedMesh.castShadow = true;
    batchedMesh.receiveShadow = true;
    batchedMesh.raycast = () => {}; // Disabled raycast per visual-direction §3

    // Register geometries
    const geomIdMap = new Map<string, number>();
    for (const [name, geom] of geomMap.entries()) {
      const gId = batchedMesh.addGeometry(geom);
      geomIdMap.set(name, gId);
    }

    // Add instances
    for (const b of plan.buildings) {
      let gId = geomIdMap.get(b.kind);
      if (gId === undefined) {
        // Fallback to first available geometry
        gId = geomIdMap.values().next().value;
      }
      if (gId === undefined) continue;

      const instId = batchedMesh.addInstance(gId);

      _tempPos.set(b.position[0], b.position[1], b.position[2]);
      _tempEuler.set(0, b.rotationY, 0);
      _tempQuat.setFromEuler(_tempEuler);
      _tempScale.set(b.scale[0], b.scale[1], b.scale[2]);
      _tempMatrix.compose(_tempPos, _tempQuat, _tempScale);

      batchedMesh.setMatrixAt(instId, _tempMatrix);
      batchedMesh.setColorAt(instId, _whiteColor);
    }

    return batchedMesh;
  }, [cityGltf, plan.buildings]);

  // 2. Build BatchedMesh for Props and Trees
  const propsBatchedMesh = useMemo(() => {
    if (!propsGltf?.scene) return null;

    const geomMap = new Map<string, THREE.BufferGeometry>();
    let atlasMaterial: THREE.MeshStandardMaterial | null = null;

    propsGltf.scene.traverse((child) => {
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

    const totalPropsCount = plan.trees.length + plan.props.length;
    const instanceCount = Math.max(1, totalPropsCount);
    const totalMaxVerts = Math.max(100000, maxVerts * 20);
    const totalMaxIndices = Math.max(160000, maxIndices * 20);

    const batchedMesh = new THREE.BatchedMesh(
      instanceCount,
      totalMaxVerts,
      totalMaxIndices,
      atlasMaterial
    );
    batchedMesh.castShadow = true;
    batchedMesh.receiveShadow = true;
    batchedMesh.raycast = () => {};

    const geomIdMap = new Map<string, number>();
    for (const [name, geom] of geomMap.entries()) {
      const gId = batchedMesh.addGeometry(geom);
      geomIdMap.set(name, gId);
    }

    // Add trees
    for (const t of plan.trees) {
      let gId = geomIdMap.get(t.kind);
      if (gId === undefined) gId = geomIdMap.values().next().value;
      if (gId === undefined) continue;

      const instId = batchedMesh.addInstance(gId);
      _tempPos.set(t.position[0], t.position[1], t.position[2]);
      _tempEuler.set(0, t.rotationY, 0);
      _tempQuat.setFromEuler(_tempEuler);
      _tempScale.set(t.scale[0], t.scale[1], t.scale[2]);
      _tempMatrix.compose(_tempPos, _tempQuat, _tempScale);

      batchedMesh.setMatrixAt(instId, _tempMatrix);
      batchedMesh.setColorAt(instId, _whiteColor);
    }

    // Add props
    for (const p of plan.props) {
      let gId = geomIdMap.get(p.kind);
      if (gId === undefined) gId = geomIdMap.values().next().value;
      if (gId === undefined) continue;

      const instId = batchedMesh.addInstance(gId);
      _tempPos.set(p.position[0], p.position[1], p.position[2]);
      _tempEuler.set(0, p.rotationY, 0);
      _tempQuat.setFromEuler(_tempEuler);
      _tempScale.set(p.scale[0], p.scale[1], p.scale[2]);
      _tempMatrix.compose(_tempPos, _tempQuat, _tempScale);

      batchedMesh.setMatrixAt(instId, _tempMatrix);
      batchedMesh.setColorAt(instId, _whiteColor);
    }

    return batchedMesh;
  }, [propsGltf, plan.trees, plan.props]);

  useEffect(() => {
    const cityGroup = cityContainerRef.current;
    if (cityGroup && cityBatchedMesh) {
      cityGroup.clear();
      cityGroup.add(cityBatchedMesh);
    }
  }, [cityBatchedMesh]);

  useEffect(() => {
    const propsGroup = propsContainerRef.current;
    if (propsGroup && propsBatchedMesh) {
      propsGroup.clear();
      if (visibleProps) {
        propsGroup.add(propsBatchedMesh);
      }
    }
  }, [propsBatchedMesh, visibleProps]);

  return (
    <group>
      <group ref={cityContainerRef} />
      <group ref={propsContainerRef} />
    </group>
  );
}

useGLTF.preload("/models/city.glb");
useGLTF.preload("/models/props.glb");
