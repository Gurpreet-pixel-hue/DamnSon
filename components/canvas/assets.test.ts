import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dequantize } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { CITY_KINDS_BY_NAME } from "./city/cityKinds";

const EXPECTED_STATIONS = [
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
];

describe("3D Assets Verification (Stage 1 F & D4)", () => {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

  it("verifies stations.glb exists, within size cap, and has 13 named archetypes", async () => {
    const filePath = path.resolve(process.cwd(), "public/models/stations.glb");
    expect(fs.existsSync(filePath), "stations.glb must exist in public/models/").toBe(true);

    const stat = fs.statSync(filePath);
    expect(stat.size, "stations.glb must be <= 1.5 MB").toBeLessThanOrEqual(1.5 * 1024 * 1024);

    const doc = await io.read(filePath);
    await doc.transform(dequantize());

    const meshes = doc.getRoot().listMeshes();
    const meshNames = meshes.map((m) => m.getName());
    expect(meshNames.sort()).toEqual([...EXPECTED_STATIONS].sort());

    // Single material using the atlas
    const materials = doc.getRoot().listMaterials();
    expect(materials.length, "stations.glb must share exactly 1 material").toBe(1);
    expect(materials[0]!.getBaseColorTexture(), "material must reference atlas texture").not.toBeNull();

    for (const mesh of meshes) {
      const name = mesh.getName();
      const prims = mesh.listPrimitives();
      expect(prims.length, `${name} must have 1 primitive`).toBe(1);

      const prim = prims[0]!;
      // D4: clean attributes
      const semantics = prim.listSemantics().sort();
      expect(semantics, `${name} attributes must be exactly POSITION, NORMAL, TEXCOORD_0, COLOR_0`).toEqual(
        ["COLOR_0", "NORMAL", "POSITION", "TEXCOORD_0"]
      );

      // Indexed geometry
      expect(prim.getIndices(), `${name} must have indexed geometry`).not.toBeNull();

      // Triangle count <= 6k
      const triangleCount = prim.getIndices()!.getCount() / 3;
      expect(triangleCount, `${name} triangles must be <= 6000`).toBeLessThanOrEqual(6000);

      // Bounding box check
      const pos = prim.getAttribute("POSITION")!.getArray()!;
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        minX = Math.min(minX, pos[i]!);
        minY = Math.min(minY, pos[i + 1]!);
        minZ = Math.min(minZ, pos[i + 2]!);
        maxX = Math.max(maxX, pos[i]!);
        maxY = Math.max(maxY, pos[i + 1]!);
        maxZ = Math.max(maxZ, pos[i + 2]!);
      }

      const w = +(maxX - minX).toFixed(2);
      const h = +(maxY - minY).toFixed(2);
      const d = +(maxZ - minZ).toFixed(2);

      expect(w, `${name} width must be <= 2.6`).toBeLessThanOrEqual(2.6);
      expect(d, `${name} depth must be <= 2.6`).toBeLessThanOrEqual(2.6);
      if (name === "milestone") {
        expect(h, "milestone height must be <= 0.3").toBeLessThanOrEqual(0.3);
      } else {
        expect(h, `${name} height must be <= 4.2`).toBeLessThanOrEqual(4.2);
      }
    }
  });

  it("verifies city.glb has known names in cityKinds and clean D4 attributes", async () => {
    const filePath = path.resolve(process.cwd(), "public/models/city.glb");
    expect(fs.existsSync(filePath), "city.glb must exist in public/models/").toBe(true);

    const doc = await io.read(filePath);
    const meshes = doc.getRoot().listMeshes();
    expect(meshes.length).toBeGreaterThanOrEqual(12);

    for (const mesh of meshes) {
      const name = mesh.getName();
      expect(CITY_KINDS_BY_NAME[name], `city.glb mesh '${name}' must be registered in cityKinds.ts`).toBeDefined();

      const prims = mesh.listPrimitives();
      for (const prim of prims) {
        const semantics = prim.listSemantics().sort();
        expect(semantics, `${name} attributes must be exactly POSITION, NORMAL, TEXCOORD_0, COLOR_0`).toEqual(
          ["COLOR_0", "NORMAL", "POSITION", "TEXCOORD_0"]
        );
        expect(prim.getIndices(), `${name} must have indexed geometry`).not.toBeNull();
      }
    }
  });

  it("verifies props.glb has known names in cityKinds and clean D4 attributes", async () => {
    const filePath = path.resolve(process.cwd(), "public/models/props.glb");
    expect(fs.existsSync(filePath), "props.glb must exist in public/models/").toBe(true);

    const doc = await io.read(filePath);
    const meshes = doc.getRoot().listMeshes();
    expect(meshes.length).toBeGreaterThanOrEqual(8);

    for (const mesh of meshes) {
      const name = mesh.getName();
      expect(CITY_KINDS_BY_NAME[name], `props.glb mesh '${name}' must be registered in cityKinds.ts`).toBeDefined();

      const prims = mesh.listPrimitives();
      for (const prim of prims) {
        const semantics = prim.listSemantics().sort();
        expect(semantics, `${name} attributes must be exactly POSITION, NORMAL, TEXCOORD_0, COLOR_0`).toEqual(
          ["COLOR_0", "NORMAL", "POSITION", "TEXCOORD_0"]
        );
        expect(prim.getIndices(), `${name} must have indexed geometry`).not.toBeNull();
      }
    }
  });

  it("verifies total file sizes of models stay within budget", () => {
    const stationsSize = fs.statSync(path.resolve(process.cwd(), "public/models/stations.glb")).size;
    const citySize = fs.statSync(path.resolve(process.cwd(), "public/models/city.glb")).size;
    const propsSize = fs.statSync(path.resolve(process.cwd(), "public/models/props.glb")).size;

    const totalMB = (stationsSize + citySize + propsSize) / (1024 * 1024);
    expect(totalMB, "public/models total size must be <= 3 MB").toBeLessThanOrEqual(3.0);
  });
});
