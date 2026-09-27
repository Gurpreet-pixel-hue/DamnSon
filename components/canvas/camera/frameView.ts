import * as THREE from "three";

export interface SafeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface FrameViewOptions {
  box: THREE.Box3;
  azimuth?: number; // default -15° in radians
  polar?: number; // default 52° in radians
  fov?: number; // default 45°
  viewport: Viewport;
  insets?: SafeInsets;
  isWholeRoute?: boolean;
}

export interface FrameViewResult {
  position: [number, number, number];
  target: [number, number, number];
  distance: number;
}

export const DEFAULT_AZIMUTH = (-15 * Math.PI) / 180;
export const DEFAULT_POLAR = (52 * Math.PI) / 180;
export const DEFAULT_FOV = 45;

export const DEFAULT_STAGE_INSETS: SafeInsets = {
  top: 56,
  bottom: 68, // stepper height (44) + 24
  left: 24,
  right: 24,
};

export const DRAWER_STAGE_INSETS: SafeInsets = {
  top: 56,
  bottom: 68,
  left: 24,
  right: 404, // drawer (380) + 24
};

export const STAGE_DISTANCE_CLAMP: [number, number] = [14, 45];
export const WHOLE_ROUTE_DISTANCE_CLAMP: [number, number] = [30, 110];

/**
 * frameView
 *
 * Pure TypeScript helper to frame a 3D bounding box with pixel-based safe insets.
 * Binary-searches camera distance at fixed spherical angles (-15° azimuth, 52° polar),
 * shifting look-at target so the box centers inside the safe rect without altering the angle.
 * Visual direction §11.8.
 */
export function frameView(options: FrameViewOptions): FrameViewResult {
  const {
    box,
    azimuth = DEFAULT_AZIMUTH,
    polar = DEFAULT_POLAR,
    fov = DEFAULT_FOV,
    viewport,
    insets = DEFAULT_STAGE_INSETS,
    isWholeRoute = false,
  } = options;

  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const aspect = width / height;
  const fovRad = (fov * Math.PI) / 180;
  const tanHalfFov = Math.tan(fovRad / 2);

  // Unit vector from target to camera position: P = T + D * u
  const u = new THREE.Vector3(
    Math.sin(polar) * Math.sin(azimuth),
    Math.cos(polar),
    Math.sin(polar) * Math.cos(azimuth)
  ).normalize();

  // Camera coordinate basis
  // forward vector (camera to target)
  const fwd = u.clone().negate().normalize();
  const upWorld = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(fwd, upWorld).normalize();
  const camUp = new THREE.Vector3().crossVectors(right, fwd).normalize();

  // Safe rect in NDC coordinates [-1, 1]
  const ndcMinX = (2 * insets.left) / width - 1;
  const ndcMaxX = 1 - (2 * insets.right) / width;
  const ndcMinY = (2 * insets.bottom) / height - 1;
  const ndcMaxY = 1 - (2 * insets.top) / height;

  // Safe rect center in NDC
  const ndcCenterX = (ndcMinX + ndcMaxX) / 2;
  const ndcCenterY = (ndcMinY + ndcMaxY) / 2;

  // Box center and 8 corners
  const center = new THREE.Vector3();
  if (box.isEmpty()) {
    box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3.2, 5));
  }
  box.getCenter(center);

  const corners: THREE.Vector3[] = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];

  // Helper to compute target, pos and fit check for a given distance D
  const getFittedTargetAndPos = (D: number) => {
    const target = center
      .clone()
      .addScaledVector(right, -ndcCenterX * D * tanHalfFov * aspect)
      .addScaledVector(camUp, -ndcCenterY * D * tanHalfFov);

    // Iterative refinement to center projected 2D bbox precisely at safe rect center
    for (let iter = 0; iter < 5; iter++) {
      const pos = target.clone().addScaledVector(u, D);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (const c of corners) {
        const delta = c.clone().sub(pos);
        const zCam = delta.dot(fwd);
        if (zCam <= 0.1) {
          return { target, pos, fits: false };
        }
        const xCam = delta.dot(right);
        const yCam = delta.dot(camUp);
        const ndcX = xCam / (zCam * tanHalfFov * aspect);
        const ndcY = yCam / (zCam * tanHalfFov);
        if (ndcX < minX) minX = ndcX;
        if (ndcX > maxX) maxX = ndcX;
        if (ndcY < minY) minY = ndcY;
        if (ndcY > maxY) maxY = ndcY;
      }

      const curCenterX = (minX + maxX) / 2;
      const curCenterY = (minY + maxY) / 2;
      const diffX = curCenterX - ndcCenterX;
      const diffY = curCenterY - ndcCenterY;

      target.addScaledVector(right, diffX * D * tanHalfFov * aspect * 0.8);
      target.addScaledVector(camUp, diffY * D * tanHalfFov * 0.8);
    }

    const pos = target.clone().addScaledVector(u, D);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const c of corners) {
      const delta = c.clone().sub(pos);
      const zCam = delta.dot(fwd);
      if (zCam <= 0.1) {
        return { target, pos, fits: false };
      }
      const xCam = delta.dot(right);
      const yCam = delta.dot(camUp);
      const ndcX = xCam / (zCam * tanHalfFov * aspect);
      const ndcY = yCam / (zCam * tanHalfFov);
      if (ndcX < minX) minX = ndcX;
      if (ndcX > maxX) maxX = ndcX;
      if (ndcY < minY) minY = ndcY;
      if (ndcY > maxY) maxY = ndcY;
    }

    const fits =
      minX >= ndcMinX - 1e-4 &&
      maxX <= ndcMaxX + 1e-4 &&
      minY >= ndcMinY - 1e-4 &&
      maxY <= ndcMaxY + 1e-4;

    return { target, pos, fits };
  };

  // Binary search distance D
  let low = 1;
  let high = 500;

  while (!getFittedTargetAndPos(high).fits && high < 2000) {
    high *= 2;
  }

  for (let i = 0; i < 35; i++) {
    const mid = (low + high) / 2;
    if (getFittedTargetAndPos(mid).fits) {
      high = mid;
    } else {
      low = mid;
    }
  }

  const unclampedDist = high;
  const [minDist, maxDist] = isWholeRoute
    ? WHOLE_ROUTE_DISTANCE_CLAMP
    : STAGE_DISTANCE_CLAMP;

  const finalDist = Math.max(minDist, Math.min(maxDist, unclampedDist));
  const { target, pos } = getFittedTargetAndPos(finalDist);

  return {
    position: [pos.x, pos.y, pos.z],
    target: [target.x, target.y, target.z],
    distance: finalDist,
  };
}
