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
import {
  frameView,
  DEFAULT_STAGE_INSETS,
  DRAWER_STAGE_INSETS,
} from "./camera/frameView";
import { computeViewportInsets } from "@/lib/graph/viewportInsets";

import { getEntranceSession } from "./entrance/entranceState";

interface CameraRigProps {
  metro: MetroVM;
  boardBounds?: BoardBounds;
}

const scratchStationPos = new THREE.Vector3();
const scratchSphere = new THREE.Sphere();

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

  useEffect(() => {
    if (controlsRef.current && typeof window !== "undefined") {
      (
        window as unknown as { __CW_CONTROLS__: CameraControls }
      ).__CW_CONTROLS__ = controlsRef.current;
    }
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
      box.expandByPoint(new THREE.Vector3(x - 1.5, y, z - 1.5));
      box.expandByPoint(new THREE.Vector3(x + 1.5, y + 3.2, z + 1.5));
    }
    const headers = deriveStageHeaders(metro);
    for (const h of headers) {
      box.expandByPoint(new THREE.Vector3(h.x, 0.57, h.z));
      box.expandByPoint(new THREE.Vector3(h.x, 2.0, h.z));
    }
    return box;
  }, [metro]);

  // Stage bounding box:
  // "its stations, their cards, and the next stage's chip. It never frames the whole city." (§11.3 & §11.8)
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
      // Add the station geometry & the plaza footprint (radius 2.4 at land height 0.170 to 0.225 per §11.8)
      box.expandByPoint(new THREE.Vector3(x - 2.4, 0.17, z - 2.4));
      box.expandByPoint(new THREE.Vector3(x + 2.4, y + 3.2, z + 2.4));
    }

    // Include next stage's chip if available (§11.3 & §11.8)
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

  // F1 / §11.8: Fog stays distance-scaled, but land within framed box never fogs (fog.near >= distance + box radius)
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
      const parentScene = (
        controls.camera as THREE.Camera & { parent?: { fog?: THREE.Fog } }
      ).parent;
      const fog = parentScene?.fog;
      if (fog && "near" in fog) {
        const dist = controls.distance;
        const currentBox = wholeRouteView
          ? wholeRouteBoundingBox
          : stageBoundingBox;
        const sphere = currentBox.getBoundingSphere(scratchSphere);
        const boxRadius = isFinite(sphere.radius) ? sphere.radius : 10;
        fog.near = Math.max(dist + boxRadius, dist * 1.5);
        fog.far = Math.max(dist * 4.5, fog.near + 60);
      }
    };

    controls.addEventListener("update", updateFog);
    updateFog();

    return () => {
      controls.removeEventListener("update", updateFog);
    };
  }, [wholeRouteView, wholeRouteBoundingBox, stageBoundingBox]);

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

  const stepperBottomInset = useViewStore((s) => s.stepperBottomInset);

  const frameCurrentStageOrRoute = useCallback(
    (instant = false) => {
      const controls = controlsRef.current;
      if (!controls || metro.stations.length === 0) return;

      const enableTransition = !instant && !prefersReducedMotion;
      controls.smoothTime = enableTransition ? 0.6 : 0;

      const targetBox = wholeRouteView
        ? wholeRouteBoundingBox
        : stageBoundingBox;
      const isDrawerOpen = Boolean(useTaskStore.getState().selectedStepId);
      const activePanel = useViewStore.getState().activePanel;
      const targetLayer = focusStage - 1;
      const isBigStage = metro.stations.filter((s) => s.layer === targetLayer).length > 4;

      const { insets } = computeViewportInsets({
        viewportWidth: size.width,
        viewportHeight: size.height,
        isTrayOpen: isBigStage && !activePanel,
        activePanel,
        isDrawerOpen,
        stepperBottomInset,
      });

      const camera = controls.camera as THREE.PerspectiveCamera;
      const fov = camera?.fov ?? 45;

      const { position, target } = frameView({
        box: targetBox,
        viewport: { width: size.width, height: size.height },
        insets,
        fov,
        isWholeRoute: wholeRouteView,
      });

      // The rig makes one call: controls.setLookAt(...position, ...target, transition) (§11.8)
      void controls.setLookAt(
        position[0],
        position[1],
        position[2],
        target[0],
        target[1],
        target[2],
        enableTransition
      );
    },
    [
      metro.stations.length,
      wholeRouteView,
      wholeRouteBoundingBox,
      stageBoundingBox,
      prefersReducedMotion,
      stepperBottomInset,
      size.width,
      size.height,
    ]
  );

  // Initial fit: load-time fit before canvas is revealed (§10.6, §11.3, §11.8, §9.4)
  useEffect(() => {
    if (metro.stations.length > 0 && !initialFittedRef.current) {
      initialFittedRef.current = true;

      const session = getEntranceSession();
      if (session.active) {
        const controls = controlsRef.current;
        if (controls) {
          const targetBox = wholeRouteView
            ? wholeRouteBoundingBox
            : stageBoundingBox;
          const camera = controls.camera as THREE.PerspectiveCamera;
          const fov = camera?.fov ?? 45;

          const { position, target } = frameView({
            box: targetBox,
            viewport: { width: size.width, height: size.height },
            insets: DEFAULT_STAGE_INSETS,
            fov,
            isWholeRoute: wholeRouteView,
          });

          const fitDistance = Math.hypot(
            position[0] - target[0],
            position[1] - target[1],
            position[2] - target[2]
          );

          // §9.4: Camera starts at polar 12°, azimuth −40°, 2.6 × the fit distance
          const startDist = 2.6 * fitDistance;
          const polar = (12 * Math.PI) / 180;
          const azimuth = (-40 * Math.PI) / 180;
          const yOff = startDist * Math.cos(polar);
          const hDist = startDist * Math.sin(polar);
          const xOff = hDist * Math.sin(azimuth);
          const zOff = hDist * Math.cos(azimuth);

          // Start pose without transition
          void controls.setLookAt(
            target[0] + xOff,
            target[1] + yOff,
            target[2] + zOff,
            target[0],
            target[1],
            target[2],
            false
          );

          // Transition to safe-fit pose over 1.6 s with smoothTime 0.35 (§9.4)
          controls.smoothTime = 0.35;
          const animTimer = setTimeout(() => {
            void controls.setLookAt(
              position[0],
              position[1],
              position[2],
              target[0],
              target[1],
              target[2],
              true
            );
          }, 50);

          return () => clearTimeout(animTimer);
        }
      }

      const t = setTimeout(() => {
        frameCurrentStageOrRoute(true);
      }, 50);
      return () => clearTimeout(t);
    }
  }, [
    metro.stations,
    wholeRouteView,
    wholeRouteBoundingBox,
    stageBoundingBox,
    size.width,
    size.height,
    frameCurrentStageOrRoute,
  ]);

  const prevFocusStageRef = useRef(focusStage);
  const prevWholeRouteViewRef = useRef(wholeRouteView);

  // On every focusStage or wholeRouteView change, glide camera to frame it (§11.3)
  useEffect(() => {
    if (!initialFittedRef.current) return;
    if (
      prevFocusStageRef.current === focusStage &&
      prevWholeRouteViewRef.current === wholeRouteView
    ) {
      return;
    }
    prevFocusStageRef.current = focusStage;
    prevWholeRouteViewRef.current = wholeRouteView;

    frameCurrentStageOrRoute(false);
  }, [focusStage, wholeRouteView, frameCurrentStageOrRoute]);

  // Track previous selection to handle drawer open / close (§11.3 & §11.8)
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

  const focusedStepId = useViewStore((s) => s.focusedStepId);
  const prevFocusedStepIdRef = useRef<string | null>(null);

  // When focusedStepId changes in a big stage, glide camera to frame that station + plaza (§12.3)
  useEffect(() => {
    if (!initialFittedRef.current || wholeRouteView) return;
    if (prevFocusedStepIdRef.current === focusedStepId) return;
    prevFocusedStepIdRef.current = focusedStepId;

    const controls = controlsRef.current;
    if (!controls) return;

    if (!focusedStepId) {
      // Returned to stage overview (e.g. Esc)
      frameCurrentStageOrRoute(false);
      return;
    }

    const station = metro.stations.find((s) => s.id === focusedStepId);
    if (!station || station.layer !== focusStage - 1) return;

    const stageStationsCount = metro.stations.filter(
      (s) => s.layer === focusStage - 1
    ).length;
    if (stageStationsCount > 4) {
      const [sx, sy, sz] = station.position3D;
      const stationBox = new THREE.Box3(
        new THREE.Vector3(sx - 2, sy - 0.2, sz - 2),
        new THREE.Vector3(sx + 2, sy + 3.2, sz + 2)
      );

      const isDrawerOpen = Boolean(selectedStepId);
      const baseInsets = isDrawerOpen
        ? DRAWER_STAGE_INSETS
        : DEFAULT_STAGE_INSETS;
      const insets = {
        ...baseInsets,
        left: !isDrawerOpen ? 320 : baseInsets.left,
        bottom: stepperBottomInset,
      };

      const camera = controls.camera as THREE.PerspectiveCamera;
      const fov = camera?.fov ?? 45;

      const { position, target } = frameView({
        box: stationBox,
        viewport: { width: size.width, height: size.height },
        insets,
        fov,
        isWholeRoute: false,
      });

      const enableTransition = !prefersReducedMotion;
      controls.smoothTime = enableTransition ? 0.6 : 0;
      void controls.setLookAt(
        position[0],
        position[1],
        position[2],
        target[0],
        target[1],
        target[2],
        enableTransition
      );
    }
  }, [
    focusedStepId,
    focusStage,
    wholeRouteView,
    metro.stations,
    selectedStepId,
    size.width,
    size.height,
    stepperBottomInset,
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
