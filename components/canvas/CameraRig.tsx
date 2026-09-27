"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { CameraControls } from "@react-three/drei";
import type { MetroVM } from "@/lib/graph/viewModel";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { deriveStageHeaders } from "./StageHeaders";
import type { BoardBounds } from "./city/planCity";

import { useThree } from "@react-three/fiber";
import { getStages } from "@/lib/graph/stages";

interface CameraRigProps {
  metro: MetroVM;
  boardBounds?: BoardBounds;
}

const scratchStationPos = new THREE.Vector3();

export function CameraRig({ metro, boardBounds }: CameraRigProps) {
  const controlsRef = useRef<CameraControls>(null);
  const { size } = useThree();
  const focusStage = useViewStore((s) => s.focusStage);
  const wholeRouteView = useViewStore((s) => s.wholeRouteView);
  const selectedStepId = useTaskStore((s) => s.selectedStepId);
  const initialFittedRef = useRef(false);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // F1: Fog scales with camera distance: on every CameraControls update (0 allocations)
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const camera = controls.camera;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = 1;
      camera.far = 400;
      camera.updateProjectionMatrix();
    }

    const updateFog = () => {
      const parentScene = (controls.camera as THREE.Camera & { parent?: { fog?: THREE.Fog } }).parent;
      const fog = parentScene?.fog;
      if (fog && "near" in fog) {
        const dist = controls.distance;
        fog.near = dist * 1.8;
        fog.far = dist * 4.5;
      }
    };

    controls.addEventListener("update", updateFog);
    updateFog();

    return () => {
      controls.removeEventListener("update", updateFog);
    };
  }, []);

  // Whole route bounding box (all stations + all stage headers)
  const wholeRouteBoundingBox = useMemo(() => {
    const box = new THREE.Box3();
    if (metro.stations.length === 0) {
      box.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 5, 10));
      return box;
    }
    for (const station of metro.stations) {
      const [x, y, z] = station.position3D;
      box.expandByPoint(new THREE.Vector3(x, y, z));
      box.expandByPoint(new THREE.Vector3(x, y + 2.8, z));
    }
    const headers = deriveStageHeaders(metro);
    for (const h of headers) {
      box.expandByPoint(new THREE.Vector3(h.x, 0.57, h.z));
      box.expandByPoint(new THREE.Vector3(h.x, 2.0, h.z));
    }
    return box;
  }, [metro]);

  // Stage bounding box:
  // "its stations, their cards, and the next stage's chip. It never frames the whole city." (§11.3)
  const stageBoundingBox = useMemo(() => {
    const box = new THREE.Box3();
    const focusedStations = metro.stations.filter(
      (s) => s.layer === focusStage - 1
    );

    if (focusedStations.length === 0) {
      return wholeRouteBoundingBox;
    }

    for (const station of focusedStations) {
      const [x, y, z] = station.position3D;
      box.expandByPoint(new THREE.Vector3(x, y, z));
      box.expandByPoint(new THREE.Vector3(x, y + 3.2, z));
      box.expandByPoint(new THREE.Vector3(x - 2.5, y, z - 2.0));
      box.expandByPoint(new THREE.Vector3(x + 2.5, y + 3.2, z + 2.0));
    }

    // Include next stage's chip if available
    const stages = getStages(metro);
    if (focusStage < stages.length) {
      const headers = deriveStageHeaders(metro);
      const nextHeader = headers.find((h) => h.layer === focusStage);
      if (nextHeader) {
        box.expandByPoint(new THREE.Vector3(nextHeader.x, 0.57, nextHeader.z));
        box.expandByPoint(new THREE.Vector3(nextHeader.x, 2.0, nextHeader.z));
      }
    }

    return box;
  }, [metro, focusStage, wholeRouteBoundingBox]);

  // Set boundary on board bounds
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !boardBounds) return;

    const boardBox = new THREE.Box3(
      new THREE.Vector3(boardBounds.minX, -2, boardBounds.minZ),
      new THREE.Vector3(boardBounds.maxX, 20, boardBounds.maxZ)
    );
    controls.setBoundary(boardBox);
  }, [boardBounds]);

  const frameCurrentStageOrRoute = useCallback(
    (instant = false) => {
      const controls = controlsRef.current;
      if (!controls || metro.stations.length === 0) return;

      const enableTransition = !instant && !prefersReducedMotion;
      controls.smoothTime = enableTransition ? 0.6 : 0;

      const targetBox = wholeRouteView ? wholeRouteBoundingBox : stageBoundingBox;
      const isDrawerOpen = Boolean(useTaskStore.getState().selectedStepId);

      void controls
        .fitToBox(targetBox, enableTransition, {
          paddingTop: 56,
          paddingBottom: 52,
          paddingLeft: 16,
          paddingRight: isDrawerOpen ? 396 : 16,
        })
        .then(() => {
          void controls.rotateTo(
            (-15 * Math.PI) / 180,
            (52 * Math.PI) / 180,
            enableTransition
          );
        });
    },
    [
      metro.stations.length,
      wholeRouteView,
      wholeRouteBoundingBox,
      stageBoundingBox,
      prefersReducedMotion,
    ]
  );

  // Initial fitToBox: load-time fit before canvas is revealed (§10.6 & §11.3)
  useEffect(() => {
    if (metro.stations.length > 0 && !initialFittedRef.current) {
      initialFittedRef.current = true;
      const t = setTimeout(() => {
        frameCurrentStageOrRoute(true);
      }, 50);
      return () => clearTimeout(t);
    }
  }, [metro.stations, frameCurrentStageOrRoute]);

  // On every focusStage or wholeRouteView change, glide camera to frame it (§11.3)
  useEffect(() => {
    if (!initialFittedRef.current) return;
    frameCurrentStageOrRoute(false);
  }, [focusStage, wholeRouteView, frameCurrentStageOrRoute]);

  // Track previous selection to handle drawer open / close (§11.3)
  const prevSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (!selectedStepId) {
      if (prevSelectedRef.current) {
        prevSelectedRef.current = null;
        frameCurrentStageOrRoute(false);
      }
      return;
    }

    const isFirstSelection = prevSelectedRef.current !== selectedStepId;
    prevSelectedRef.current = selectedStepId;
    if (!isFirstSelection) return;

    const station = metro.stations.find((s) => s.id === selectedStepId);
    if (!station) return;

    // "Clicking a card in the focused stage opens the drawer and does not move the camera,
    // unless the station would sit under the drawer. In that case the camera pans only enough to clear the drawer." (§11.3)
    if (station.layer === focusStage - 1 && !wholeRouteView) {
      scratchStationPos.set(...station.position3D).project(controls.camera);
      const screenX = ((scratchStationPos.x + 1) / 2) * size.width;
      const drawerLeftEdge = size.width - 380;
      if (screenX > drawerLeftEdge - 40) {
        const deltaPx = screenX - (drawerLeftEdge - 80);
        const cam = controls.camera as THREE.PerspectiveCamera;
        const truckFactor =
          (controls.distance * Math.tan((cam.fov * Math.PI) / 360)) /
          (size.height / 2);
        const worldTruckX = -deltaPx * truckFactor;
        const enableTransition = !prefersReducedMotion;
        controls.smoothTime = enableTransition ? 0.6 : 0;
        void controls.truck(worldTruckX, 0, enableTransition);
      }
    } else {
      frameCurrentStageOrRoute(false);
    }
  }, [
    selectedStepId,
    focusStage,
    wholeRouteView,
    metro.stations,
    size.width,
    size.height,
    prefersReducedMotion,
    frameCurrentStageOrRoute,
  ]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={10}
      maxDistance={120}
      maxPolarAngle={(70 * Math.PI) / 180}
      minPolarAngle={(10 * Math.PI) / 180}
    />
  );
}
