import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  frameView,
  DEFAULT_AZIMUTH,
  DEFAULT_POLAR,
  DEFAULT_STAGE_INSETS,
  DRAWER_STAGE_INSETS,
} from "./frameView";

describe("frameView (§11.8)", () => {
  const viewport = { width: 1440, height: 900 };

  it("projects all corners inside the safe rect with <= 15% slack on the tight axis", () => {
    // Stage spanning ~20 units (natural stage dimensions)
    const box = new THREE.Box3(
      new THREE.Vector3(-10, 0, -8),
      new THREE.Vector3(10, 3.2, 8)
    );

    const res = frameView({
      box,
      viewport,
      insets: DEFAULT_STAGE_INSETS,
      isWholeRoute: false,
    });

    expect(res.distance).toBeGreaterThanOrEqual(14);
    expect(res.distance).toBeLessThanOrEqual(45);

    // Verify all corners project inside safe rect
    const u = new THREE.Vector3(
      Math.sin(DEFAULT_POLAR) * Math.sin(DEFAULT_AZIMUTH),
      Math.cos(DEFAULT_POLAR),
      Math.sin(DEFAULT_POLAR) * Math.cos(DEFAULT_AZIMUTH)
    ).normalize();
    const fwd = u.clone().negate().normalize();
    const upWorld = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, upWorld).normalize();
    const camUp = new THREE.Vector3().crossVectors(right, fwd).normalize();

    const ndcMinX = (2 * DEFAULT_STAGE_INSETS.left) / viewport.width - 1;
    const ndcMaxX = 1 - (2 * DEFAULT_STAGE_INSETS.right) / viewport.width;
    const ndcMinY = (2 * DEFAULT_STAGE_INSETS.bottom) / viewport.height - 1;
    const ndcMaxY = 1 - (2 * DEFAULT_STAGE_INSETS.top) / viewport.height;

    const safeNdcW = ndcMaxX - ndcMinX;
    const safeNdcH = ndcMaxY - ndcMinY;

    const pos = new THREE.Vector3(...res.position);
    const aspect = viewport.width / viewport.height;
    const tanHalfFov = Math.tan(((45 * Math.PI) / 180) / 2);

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

    let minProjX = Infinity;
    let maxProjX = -Infinity;
    let minProjY = Infinity;
    let maxProjY = -Infinity;

    for (const corner of corners) {
      const delta = corner.clone().sub(pos);
      const zCam = delta.dot(fwd);
      expect(zCam).toBeGreaterThan(0);

      const xCam = delta.dot(right);
      const yCam = delta.dot(camUp);
      const ndcX = xCam / (zCam * tanHalfFov * aspect);
      const ndcY = yCam / (zCam * tanHalfFov);

      expect(ndcX).toBeGreaterThanOrEqual(ndcMinX - 0.01);
      expect(ndcX).toBeLessThanOrEqual(ndcMaxX + 0.01);
      expect(ndcY).toBeGreaterThanOrEqual(ndcMinY - 0.01);
      expect(ndcY).toBeLessThanOrEqual(ndcMaxY + 0.01);

      if (ndcX < minProjX) minProjX = ndcX;
      if (ndcX > maxProjX) maxProjX = ndcX;
      if (ndcY < minProjY) minProjY = ndcY;
      if (ndcY > maxProjY) maxProjY = ndcY;
    }

    const projW = maxProjX - minProjX;
    const projH = maxProjY - minProjY;
    const slackX = (safeNdcW - projW) / safeNdcW;
    const slackY = (safeNdcH - projH) / safeNdcH;
    const tightSlack = Math.min(slackX, slackY);

    // Tight axis slack should be <= 15%
    expect(tightSlack).toBeLessThanOrEqual(0.15);
  });

  it("frames a single-station stage at distance <= 30", () => {
    // Single station box (approx 3x3 footprint with 3.2 card height)
    const singleStationBox = new THREE.Box3(
      new THREE.Vector3(2, 0, 1),
      new THREE.Vector3(4, 3.2, 3)
    );

    const res = frameView({
      box: singleStationBox,
      viewport,
      insets: DEFAULT_STAGE_INSETS,
      isWholeRoute: false,
    });

    expect(res.distance).toBeLessThanOrEqual(30);
    expect(res.distance).toBeGreaterThanOrEqual(14);
  });

  it("moves the target when drawer is open, while preserving fixed azimuth and polar angles", () => {
    const box = new THREE.Box3(
      new THREE.Vector3(-4, 0, -3),
      new THREE.Vector3(4, 3.2, 3)
    );

    const closedRes = frameView({
      box,
      viewport,
      insets: DEFAULT_STAGE_INSETS,
      isWholeRoute: false,
    });

    const openRes = frameView({
      box,
      viewport,
      insets: DRAWER_STAGE_INSETS,
      isWholeRoute: false,
    });

    // Target must move to accommodate the right inset (drawer)
    expect(openRes.target[0]).not.toBeCloseTo(closedRes.target[0], 2);

    // Angles must be identical: vector from target to pos must have the exact same direction
    const dirClosed = new THREE.Vector3(...closedRes.position)
      .sub(new THREE.Vector3(...closedRes.target))
      .normalize();

    const dirOpen = new THREE.Vector3(...openRes.position)
      .sub(new THREE.Vector3(...openRes.target))
      .normalize();

    expect(dirOpen.x).toBeCloseTo(dirClosed.x, 4);
    expect(dirOpen.y).toBeCloseTo(dirClosed.y, 4);
    expect(dirOpen.z).toBeCloseTo(dirClosed.z, 4);
  });

  it("respects whole-route distance clamping [30, 110]", () => {
    const hugeBox = new THREE.Box3(
      new THREE.Vector3(-40, 0, -40),
      new THREE.Vector3(40, 5, 40)
    );

    const res = frameView({
      box: hugeBox,
      viewport,
      isWholeRoute: true,
    });

    expect(res.distance).toBeGreaterThanOrEqual(30);
    expect(res.distance).toBeLessThanOrEqual(110);
  });
});
