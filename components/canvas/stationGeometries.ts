import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { OfficeType } from "@/lib/graph/viewModel";

export type ArchetypeKey = OfficeType | "milestone";

export const ARCHETYPE_KEYS: readonly ArchetypeKey[] = [
  "municipal_hq",
  "ward_office",
  "fire_services",
  "health_department",
  "revenue_office",
  "labour_department",
  "police",
  "pollution_control_board",
  "utility_provider",
  "court_or_notary",
  "other",
  "online_portal",
  "milestone",
] as const;

/**
 * Standardize geometry before merging:
 * 1. Convert to non-indexed to avoid index mismatches
 * 2. Keep only position and normal attributes
 * 3. Ensure vertex normals are computed
 */
function sanitizeForMerge(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const nonIndexed = geom.index ? geom.toNonIndexed() : geom.clone();
  const position = nonIndexed.getAttribute("position");
  if (!position) {
    throw new Error("Geometry missing position attribute");
  }

  const clean = new THREE.BufferGeometry();
  clean.setAttribute("position", position.clone());

  const normal = nonIndexed.getAttribute("normal");
  if (!normal) {
    clean.computeVertexNormals();
  } else {
    clean.setAttribute("normal", normal.clone());
  }

  nonIndexed.dispose();
  geom.dispose();
  return clean;
}

/**
 * Creates a triangular prism centered at (0, baseY + height/2, 0)
 * spanning width along X, height along Y, depth along Z.
 */
function createTriangularPrism(
  width: number,
  height: number,
  depth: number,
  baseY: number,
  centerZ = 0
): THREE.BufferGeometry {
  const halfW = width / 2;
  const halfD = depth / 2;
  const y0 = baseY;
  const y1 = baseY + height;
  const z0 = centerZ - halfD;
  const z1 = centerZ + halfD;

  // 6 vertices of a triangular prism with triangular faces on Z:
  // v0: (-halfW, y0, z1), v1: (halfW, y0, z1), v2: (0, y1, z1)
  // v3: (-halfW, y0, z0), v4: (halfW, y0, z0), v5: (0, y1, z0)
  const vertices = new Float32Array([
    // Front face (z1)
    -halfW, y0, z1,   halfW, y0, z1,   0, y1, z1,
    // Back face (z0)
    0, y1, z0,   halfW, y0, z0,   -halfW, y0, z0,
    // Bottom face
    -halfW, y0, z0,   halfW, y0, z0,   halfW, y0, z1,
    -halfW, y0, z0,   halfW, y0, z1,   -halfW, y0, z1,
    // Left slope face
    0, y1, z1,   -halfW, y0, z1,   -halfW, y0, z0,
    0, y1, z1,   -halfW, y0, z0,   0, y1, z0,
    // Right slope face
    halfW, y0, z1,   0, y1, z1,   0, y1, z0,
    halfW, y0, z1,   0, y1, z0,   halfW, y0, z0,
  ]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geom.computeVertexNormals();
  return geom;
}

function buildMunicipalHq(): THREE.BufferGeometry {
  // Stepped tower (1.6x0.8x1.6 + 1.2x0.9x1.2 + 0.8x0.9x0.8)
  const b1 = sanitizeForMerge(new THREE.BoxGeometry(1.6, 0.8, 1.6).translate(0, 0.4, 0));
  const b2 = sanitizeForMerge(new THREE.BoxGeometry(1.2, 0.9, 1.2).translate(0, 0.8 + 0.45, 0));
  const b3 = sanitizeForMerge(new THREE.BoxGeometry(0.8, 0.9, 0.8).translate(0, 1.7 + 0.45, 0));

  const merged = mergeGeometries([b1, b2, b3], false);
  b1.dispose();
  b2.dispose();
  b3.dispose();
  return merged!;
}

function buildWardOffice(): THREE.BufferGeometry {
  // 1.4x1.0x1.4 block + 4-segment pyramid roof 0.6 high
  const block = sanitizeForMerge(new THREE.BoxGeometry(1.4, 1.0, 1.4).translate(0, 0.5, 0));
  const radius = 1.4 / Math.SQRT2;
  const roof = sanitizeForMerge(
    new THREE.ConeGeometry(radius, 0.6, 4)
      .rotateY(Math.PI / 4)
      .translate(0, 1.0 + 0.3, 0)
  );

  const merged = mergeGeometries([block, roof], false);
  block.dispose();
  roof.dispose();
  return merged!;
}

function buildFireServices(): THREE.BufferGeometry {
  // 1.5x1.0x1.2 block + 0.4x1.2x0.4 hose tower at one corner
  const block = sanitizeForMerge(new THREE.BoxGeometry(1.5, 1.0, 1.2).translate(0, 0.5, 0));
  const cornerX = 1.5 / 2 - 0.4 / 2;
  const cornerZ = 1.2 / 2 - 0.4 / 2;
  const tower = sanitizeForMerge(
    new THREE.BoxGeometry(0.4, 1.2, 0.4).translate(cornerX, 1.0 + 0.6, cornerZ)
  );

  const merged = mergeGeometries([block, tower], false);
  block.dispose();
  tower.dispose();
  return merged!;
}

function buildHealthDepartment(): THREE.BufferGeometry {
  // 1.4x1.1x1.4 block + flat cross (two 0.9x0.08x0.25 bars) on the roof
  const block = sanitizeForMerge(new THREE.BoxGeometry(1.4, 1.1, 1.4).translate(0, 0.55, 0));
  const bar1 = sanitizeForMerge(
    new THREE.BoxGeometry(0.9, 0.08, 0.25).translate(0, 1.1 + 0.04, 0)
  );
  const bar2 = sanitizeForMerge(
    new THREE.BoxGeometry(0.25, 0.08, 0.9).translate(0, 1.1 + 0.04, 0)
  );

  const merged = mergeGeometries([block, bar1, bar2], false);
  block.dispose();
  bar1.dispose();
  bar2.dispose();
  return merged!;
}

function buildRevenueOffice(): THREE.BufferGeometry {
  // 1.5x0.9x1.2 block + 4 columns (r 0.08, h 0.9) in front + 0.15 slab
  const block = sanitizeForMerge(
    new THREE.BoxGeometry(1.5, 0.9, 1.0).translate(0, 0.45, -0.1)
  );
  const cols: THREE.BufferGeometry[] = [];
  const colX = [-0.6, -0.2, 0.2, 0.6];
  for (const x of colX) {
    cols.push(
      sanitizeForMerge(
        new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8).translate(x, 0.45, 0.48)
      )
    );
  }
  const slab = sanitizeForMerge(
    new THREE.BoxGeometry(1.5, 0.15, 1.3).translate(0, 0.9 + 0.075, 0.05)
  );

  const merged = mergeGeometries([block, ...cols, slab], false);
  block.dispose();
  for (const col of cols) col.dispose();
  slab.dispose();
  return merged!;
}

function buildLabourDepartment(): THREE.BufferGeometry {
  // 1.4x1.2x1.2 block with a sawtooth roof (2 prisms)
  const block = sanitizeForMerge(new THREE.BoxGeometry(1.4, 1.2, 1.2).translate(0, 0.6, 0));
  const p1 = sanitizeForMerge(createTriangularPrism(1.4, 0.35, 0.6, 1.2, -0.3));
  const p2 = sanitizeForMerge(createTriangularPrism(1.4, 0.35, 0.6, 1.2, 0.3));

  const merged = mergeGeometries([block, p1, p2], false);
  block.dispose();
  p1.dispose();
  p2.dispose();
  return merged!;
}

function buildPolice(): THREE.BufferGeometry {
  // 1.3x1.1x1.3 block + 0.5 cylinder beacon
  const block = sanitizeForMerge(new THREE.BoxGeometry(1.3, 1.1, 1.3).translate(0, 0.55, 0));
  const beacon = sanitizeForMerge(
    new THREE.CylinderGeometry(0.25, 0.25, 0.5, 16).translate(0, 1.1 + 0.25, 0)
  );

  const merged = mergeGeometries([block, beacon], false);
  block.dispose();
  beacon.dispose();
  return merged!;
}

function buildPollutionControlBoard(): THREE.BufferGeometry {
  // 1.2x0.8x1.2 block + chimney cylinder r 0.15, h 1.4
  const block = sanitizeForMerge(new THREE.BoxGeometry(1.2, 0.8, 1.2).translate(0, 0.4, 0));
  const chimney = sanitizeForMerge(
    new THREE.CylinderGeometry(0.15, 0.15, 1.4, 16).translate(0.35, 0.8 + 0.7, 0.35)
  );

  const merged = mergeGeometries([block, chimney], false);
  block.dispose();
  chimney.dispose();
  return merged!;
}

function buildUtilityProvider(): THREE.BufferGeometry {
  // 1.0x0.8x1.0 block + tank cylinder r 0.45, h 0.9
  const block = sanitizeForMerge(new THREE.BoxGeometry(1.0, 0.8, 1.0).translate(0, 0.4, 0));
  const tank = sanitizeForMerge(
    new THREE.CylinderGeometry(0.45, 0.45, 0.9, 16).translate(0, 0.8 + 0.45, 0)
  );

  const merged = mergeGeometries([block, tank], false);
  block.dispose();
  tank.dispose();
  return merged!;
}

function buildCourtOrNotary(): THREE.BufferGeometry {
  // 1.5x1.0x1.1 block + triangular pediment
  const block = sanitizeForMerge(new THREE.BoxGeometry(1.5, 1.0, 1.1).translate(0, 0.5, 0));
  const pediment = sanitizeForMerge(
    createTriangularPrism(1.5, 0.4, 1.1, 1.0, 0)
  );

  const merged = mergeGeometries([block, pediment], false);
  block.dispose();
  pediment.dispose();
  return merged!;
}

function buildOther(): THREE.BufferGeometry {
  // 1.2x1.0x1.2 block
  const block = sanitizeForMerge(new THREE.BoxGeometry(1.2, 1.0, 1.2).translate(0, 0.5, 0));
  return block;
}

function buildOnlinePortal(): THREE.BufferGeometry {
  // floating hexagonal prism (r 0.7, h 0.35) with a thin rim ring
  const prism = sanitizeForMerge(
    new THREE.CylinderGeometry(0.7, 0.7, 0.35, 6).translate(0, 0.175, 0)
  );
  const ring = sanitizeForMerge(
    new THREE.TorusGeometry(0.68, 0.03, 8, 24)
      .rotateX(Math.PI / 2)
      .translate(0, 0.35, 0)
  );

  const merged = mergeGeometries([prism, ring], false);
  prism.dispose();
  ring.dispose();
  return merged!;
}

function buildMilestone(): THREE.BufferGeometry {
  // Disc radius 0.8, height 0.12 (diameter 1.6)
  // Interchange ring (radius 0.66, tube 0.08, laid flat) on disc -> total height 0.12 + 0.16 = 0.28 <= 0.3
  const disc = sanitizeForMerge(
    new THREE.CylinderGeometry(0.8, 0.8, 0.12, 32).translate(0, 0.06, 0)
  );
  const ring = sanitizeForMerge(
    new THREE.TorusGeometry(0.66, 0.08, 16, 32)
      .rotateX(Math.PI / 2)
      .translate(0, 0.12 + 0.08, 0)
  );

  const merged = mergeGeometries([disc, ring], false);
  disc.dispose();
  ring.dispose();
  return merged!;
}

let cachedGeometries: Map<ArchetypeKey, THREE.BufferGeometry> | null = null;

export function getStationGeometries(): Map<ArchetypeKey, THREE.BufferGeometry> {
  if (cachedGeometries) {
    return cachedGeometries;
  }

  const map = new Map<ArchetypeKey, THREE.BufferGeometry>();
  map.set("municipal_hq", buildMunicipalHq());
  map.set("ward_office", buildWardOffice());
  map.set("fire_services", buildFireServices());
  map.set("health_department", buildHealthDepartment());
  map.set("revenue_office", buildRevenueOffice());
  map.set("labour_department", buildLabourDepartment());
  map.set("police", buildPolice());
  map.set("pollution_control_board", buildPollutionControlBoard());
  map.set("utility_provider", buildUtilityProvider());
  map.set("court_or_notary", buildCourtOrNotary());
  map.set("other", buildOther());
  map.set("online_portal", buildOnlinePortal());
  map.set("milestone", buildMilestone());

  for (const geom of map.values()) {
    geom.computeBoundingBox();
  }

  cachedGeometries = map;
  return map;
}

export function disposeStationGeometries(): void {
  if (!cachedGeometries) return;
  for (const geom of cachedGeometries.values()) {
    geom.dispose();
  }
  cachedGeometries = null;
}
