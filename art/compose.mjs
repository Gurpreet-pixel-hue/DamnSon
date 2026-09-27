import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { joinPrimitives } from "@gltf-transform/functions";
import draco3d from "draco3d";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "art/src");
const OUT_DIR = path.join(ROOT, "art/out");

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// 1. Swatch Definitions for Slot 6 (slot index 5: x: 512..1023, y: 1024..1535)
// ---------------------------------------------------------------------------
const SWATCH_COLORS = [
  // Row 0: Nature greens & vegetation
  { id: "nature_green_dark", r: 41, g: 180, b: 142 },
  { id: "nature_green_leaf", r: 44, g: 201, b: 171 },
  { id: "nature_green_palm", r: 63, g: 167, b: 112 },
  { id: "nature_green_lime", r: 120, g: 188, b: 66 },
  { id: "nature_green_forest", r: 35, g: 120, b: 70 },
  { id: "nature_green_moss", r: 140, g: 195, b: 85 },
  { id: "nature_autumn_orange", r: 255, g: 142, b: 98 },
  { id: "nature_autumn_rust", r: 196, g: 109, b: 75 },

  // Row 1: Wood & trunks & rocks
  { id: "wood_brown", r: 142, g: 81, b: 54 },
  { id: "wood_dark", r: 90, g: 51, b: 29 },
  { id: "wood_light", r: 186, g: 118, b: 71 },
  { id: "wood_bark", r: 114, g: 69, b: 44 },
  { id: "rock_grey", r: 184, g: 198, b: 201 },
  { id: "rock_dark", r: 108, g: 122, b: 137 },
  { id: "flower_yellow", r: 255, g: 215, b: 0 },
  { id: "flower_red", r: 229, g: 57, b: 53 },

  // Row 2: Boats & industrial trims
  { id: "boat_hull", r: 186, g: 118, b: 71 },
  { id: "boat_deck", r: 209, g: 192, b: 171 },
  { id: "boat_metal", r: 96, g: 96, b: 96 },
  { id: "boat_dark", r: 133, g: 84, b: 50 },
  { id: "boat_glass", r: 169, g: 188, b: 196 },
  { id: "iron_dark", r: 60, g: 60, b: 60 },
  { id: "steel_bright", r: 200, g: 200, b: 200 },
  { id: "plastic_white", r: 245, g: 245, b: 245 },

  // Row 3: Civic Metro Tokens & Stand-in details
  { id: "brand_red", r: 179, g: 38, b: 30 },        // #B3261E
  { id: "portal_screen", r: 31, g: 99, b: 214 },     // #1F63D6 (bright emissive blue)
  { id: "portal_glass", r: 245, g: 239, b: 227 },    // #F5EFE3
  { id: "track_normal", r: 154, g: 163, b: 173 },   // #9AA3AD
  { id: "done_green", r: 30, g: 127, b: 59 },        // #1E7F3B
  { id: "may_apply_amber", r: 180, g: 83, b: 9 },    // #B45309
  { id: "plaza_cream", r: 242, g: 235, b: 221 },     // #F2EBDD
  { id: "land_tan", r: 234, g: 223, b: 200 },        // #EADFC8

  // Row 4: Additional architectural swatches
  { id: "roof_tile_red", r: 180, g: 65, b: 50 },
  { id: "concrete_warm", r: 214, g: 204, b: 186 },
  { id: "chimney_dark", r: 70, g: 70, b: 70 },
  { id: "green_ring", r: 40, g: 160, b: 80 },
  { id: "water_tank_blue", r: 60, g: 120, b: 180 },
  { id: "police_blue", r: 25, g: 60, b: 180 },
  { id: "ambulance_white", r: 250, g: 250, b: 250 },
  { id: "pure_white", r: 255, g: 255, b: 255 },
];

const SWATCH_UV_MAP = new Map();

// ---------------------------------------------------------------------------
// 2. Build Atlas Image (1024x1536)
// ---------------------------------------------------------------------------
async function buildAtlas() {
  console.log("Generating art/out/atlas.png (1024x1536)...");

  const packs = [
    { name: "commercial", file: path.join(SRC_DIR, "kenney-city-kit-commercial/Textures/colormap.png"), left: 0, top: 0 },
    { name: "suburban", file: path.join(SRC_DIR, "kenney-city-kit-suburban/Textures/colormap.png"), left: 512, top: 0 },
    { name: "industrial", file: path.join(SRC_DIR, "kenney-city-kit-industrial/Textures/colormap.png"), left: 0, top: 512 },
    { name: "roads", file: path.join(SRC_DIR, "kenney-city-kit-roads/Textures/colormap.png"), left: 512, top: 512 },
    { name: "cars", file: path.join(SRC_DIR, "kenney-car-kit/Textures/colormap.png"), left: 0, top: 1024 },
  ];

  const composites = [];

  // Slots 0..4 with 8px edge-padded gutter
  for (const p of packs) {
    const padded = await sharp(p.file)
      .resize(496, 496)
      .extend({ top: 8, bottom: 8, left: 8, right: 8, extendWith: "copy" })
      .toBuffer();
    composites.push({ input: padded, left: p.left, top: p.top });
  }

  // Slot 5 (Slot 6 in 1-based indexing): Swatch grid (8 columns x 8 rows of 62x62 pixels)
  const slotW = 512;
  const slotH = 512;
  const cellW = 62;
  const cellH = 62;
  const swatchRaw = Buffer.alloc(slotW * slotH * 4, 255);

  // Fill cells and compute UVs
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const idx = r * 8 + c;
      const color = SWATCH_COLORS[idx] || { r: 255, g: 255, b: 255 };

      // Fill cell pixels within 8px margin
      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const px = 8 + c * cellW + x;
          const py = 8 + r * cellH + y;
          if (px < slotW && py < slotH) {
            const offset = (py * slotW + px) * 4;
            swatchRaw[offset] = color.r;
            swatchRaw[offset + 1] = color.g;
            swatchRaw[offset + 2] = color.b;
            swatchRaw[offset + 3] = 255;
          }
        }
      }

      // UV center coordinate in the 1024x1536 atlas
      const cx = 8 + (c + 0.5) * cellW;
      const cy = 8 + (r + 0.5) * cellH;
      const u = (512 + cx) / 1024;
      const v = (1024 + cy) / 1536;

      SWATCH_UV_MAP.set(color.id, [u, v]);
      SWATCH_UV_MAP.set(`${color.r},${color.g},${color.b}`, [u, v]);
    }
  }

  // Pad the 8px edges of slot 5 with the border pixels
  for (let y = 0; y < slotH; y++) {
    const srcY = Math.min(Math.max(y, 8), 503);
    for (let x = 0; x < slotW; x++) {
      const srcX = Math.min(Math.max(x, 8), 503);
      if (srcX !== x || srcY !== y) {
        const destOffset = (y * slotW + x) * 4;
        const srcOffset = (srcY * slotW + srcX) * 4;
        swatchRaw[destOffset] = swatchRaw[srcOffset];
        swatchRaw[destOffset + 1] = swatchRaw[srcOffset + 1];
        swatchRaw[destOffset + 2] = swatchRaw[srcOffset + 2];
        swatchRaw[destOffset + 3] = 255;
      }
    }
  }

  composites.push({
    input: swatchRaw,
    raw: { width: slotW, height: slotH, channels: 4 },
    left: 512,
    top: 1024,
  });

  const atlasPath = path.join(OUT_DIR, "atlas.png");
  await sharp({
    create: {
      width: 1024,
      height: 1536,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(atlasPath);

  const stat = fs.statSync(atlasPath);
  console.log(`Atlas created: ${atlasPath} (${(stat.size / 1024).toFixed(1)} KB)`);
  return atlasPath;
}

// ---------------------------------------------------------------------------
// 3. Match Material Color to Swatch UV
// ---------------------------------------------------------------------------
function getClosestSwatchUV(r, g, b) {
  let bestDist = Infinity;
  let bestUV = [0.5, 0.5];

  for (const sw of SWATCH_COLORS) {
    const dist = (sw.r - r) ** 2 + (sw.g - g) ** 2 + (sw.b - b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestUV = SWATCH_UV_MAP.get(sw.id);
    }
  }
  return bestUV;
}

// ---------------------------------------------------------------------------
// 4. Create Target Primitive from Source Primitive (Decoupled, D4 Clean)
// ---------------------------------------------------------------------------
function createTargetPrimitive(srcPrim, targetDoc, targetBuffer, targetMat, slotIdx, defaultUV = null, transform = null) {
  const posAcc = srcPrim.getAttribute("POSITION");
  const count = posAcc.getCount();
  const rawPos = posAcc.getArray();
  const posArr = new Float32Array(rawPos);

  const rawNorm = srcPrim.getAttribute("NORMAL")?.getArray();
  const normArr = rawNorm ? new Float32Array(rawNorm) : new Float32Array(count * 3);
  if (!rawNorm) {
    for (let i = 0; i < count; i++) normArr[i * 3 + 1] = 1;
  }

  // Transform positions and normals if transform specified
  if (transform) {
    const { scale = [1, 1, 1], translate = [0, 0, 0], rotY = 0 } = transform;
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);

    for (let i = 0; i < count; i++) {
      let x = posArr[i * 3] * scale[0];
      let y = posArr[i * 3 + 1] * scale[1];
      let z = posArr[i * 3 + 2] * scale[2];

      if (rotY !== 0) {
        const rx = x * cosY + z * sinY;
        const rz = -x * sinY + z * cosY;
        x = rx;
        z = rz;
      }

      posArr[i * 3] = x + translate[0];
      posArr[i * 3 + 1] = y + translate[1];
      posArr[i * 3 + 2] = z + translate[2];

      if (rotY !== 0) {
        const nx = normArr[i * 3];
        const nz = normArr[i * 3 + 2];
        normArr[i * 3] = nx * cosY + nz * sinY;
        normArr[i * 3 + 2] = -nx * sinY + nz * cosY;
      }
    }
  }

  // Compute UVs
  const uvArr = new Float32Array(count * 2);
  const srcUvAcc = srcPrim.getAttribute("TEXCOORD_0");

  if (slotIdx >= 0 && slotIdx <= 4 && srcUvAcc) {
    const col = slotIdx % 2;
    const row = Math.floor(slotIdx / 2);
    const oldUVs = srcUvAcc.getArray();
    for (let i = 0; i < count; i++) {
      const u = Math.min(Math.max(oldUVs[i * 2] ?? 0, 0), 1);
      const v = Math.min(Math.max(oldUVs[i * 2 + 1] ?? 0, 0), 1);
      uvArr[i * 2] = (col * 512 + 8 + u * 496) / 1024;
      uvArr[i * 2 + 1] = (row * 512 + 8 + v * 496) / 1536;
    }
  } else if (defaultUV) {
    for (let i = 0; i < count; i++) {
      uvArr[i * 2] = defaultUV[0];
      uvArr[i * 2 + 1] = defaultUV[1];
    }
  } else {
    const mat = srcPrim.getMaterial();
    const factor = mat?.getRoughnessMetallic?.()?.baseColorFactor || [1, 1, 1, 1];
    const uv = getClosestSwatchUV(Math.round(factor[0] * 255), Math.round(factor[1] * 255), Math.round(factor[2] * 255));
    for (let i = 0; i < count; i++) {
      uvArr[i * 2] = uv[0];
      uvArr[i * 2 + 1] = uv[1];
    }
  }

  // COLOR_0
  const srcColAcc = srcPrim.getAttribute("COLOR_0");
  const colArr = srcColAcc ? new Float32Array(srcColAcc.getArray()) : new Float32Array(count * 3).fill(1);

  // Indices
  const srcIdxAcc = srcPrim.getIndices();
  let idxArr;
  if (srcIdxAcc) {
    const rawIdx = srcIdxAcc.getArray();
    idxArr = count > 65535 ? new Uint32Array(rawIdx) : new Uint16Array(rawIdx);
  } else {
    idxArr = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
    for (let i = 0; i < count; i++) idxArr[i] = i;
  }

  const prim = targetDoc.createPrimitive()
    .setAttribute("POSITION", targetDoc.createAccessor().setType("VEC3").setArray(posArr).setBuffer(targetBuffer))
    .setAttribute("NORMAL", targetDoc.createAccessor().setType("VEC3").setArray(normArr).setBuffer(targetBuffer))
    .setAttribute("TEXCOORD_0", targetDoc.createAccessor().setType("VEC2").setArray(uvArr).setBuffer(targetBuffer))
    .setAttribute("COLOR_0", targetDoc.createAccessor().setType("VEC3").setArray(colArr).setBuffer(targetBuffer))
    .setIndices(targetDoc.createAccessor().setType("SCALAR").setArray(idxArr).setBuffer(targetBuffer))
    .setMaterial(targetMat);

  return prim;
}

// ---------------------------------------------------------------------------
// 5. Create Procedural Primitives
// ---------------------------------------------------------------------------
function createBoxPrimitive(doc, buffer, material, min, max, uv) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;

  const positions = [
    // Front (+Z)
    x0, y0, z1,  x1, y0, z1,  x1, y1, z1,  x0, y1, z1,
    // Back (-Z)
    x1, y0, z0,  x0, y0, z0,  x0, y1, z0,  x1, y1, z0,
    // Top (+Y)
    x0, y1, z1,  x1, y1, z1,  x1, y1, z0,  x0, y1, z0,
    // Bottom (-Y)
    x0, y0, z0,  x1, y0, z0,  x1, y0, z1,  x0, y0, z1,
    // Right (+X)
    x1, y0, z1,  x1, y0, z0,  x1, y1, z0,  x1, y1, z1,
    // Left (-X)
    x0, y0, z0,  x0, y0, z1,  x0, y1, z1,  x0, y1, z0
  ];

  const normals = [
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    0,-1, 0,  0,-1, 0,  0,-1, 0,  0,-1, 0,
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
   -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
  ];

  const uvs = [];
  const colors = [];
  for (let i = 0; i < 24; i++) {
    uvs.push(uv[0], uv[1]);
    colors.push(1, 1, 1);
  }

  const indices = [];
  for (let f = 0; f < 6; f++) {
    const o = f * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }

  const prim = doc.createPrimitive()
    .setMaterial(material)
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(uvs)).setBuffer(buffer))
    .setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(new Float32Array(colors)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer));

  return prim;
}

function createRingPrismPrimitive(doc, buffer, material, rIn, rOut, height, segments, uv) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  for (let i = 0; i < segments; i++) {
    const theta0 = (i / segments) * Math.PI * 2;
    const theta1 = ((i + 1) / segments) * Math.PI * 2;

    const cos0 = Math.cos(theta0);
    const sin0 = Math.sin(theta0);
    const cos1 = Math.cos(theta1);
    const sin1 = Math.sin(theta1);

    // Top quad
    const oTop = positions.length / 3;
    positions.push(
      rIn * cos0, height, rIn * sin0,
      rOut * cos0, height, rOut * sin0,
      rOut * cos1, height, rOut * sin1,
      rIn * cos1, height, rIn * sin1
    );
    for (let k = 0; k < 4; k++) {
      normals.push(0, 1, 0);
      uvs.push(uv[0], uv[1]);
      colors.push(1, 1, 1);
    }
    indices.push(oTop, oTop + 1, oTop + 2, oTop, oTop + 2, oTop + 3);

    // Outer wall quad
    const oOut = positions.length / 3;
    positions.push(
      rOut * cos0, 0, rOut * sin0,
      rOut * cos1, 0, rOut * sin1,
      rOut * cos1, height, rOut * sin1,
      rOut * cos0, height, rOut * sin0
    );
    for (let k = 0; k < 4; k++) {
      const midTheta = (theta0 + theta1) / 2;
      normals.push(Math.cos(midTheta), 0, Math.sin(midTheta));
      uvs.push(uv[0], uv[1]);
      colors.push(1, 1, 1);
    }
    indices.push(oOut, oOut + 1, oOut + 2, oOut, oOut + 2, oOut + 3);
  }

  const prim = doc.createPrimitive()
    .setMaterial(material)
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(uvs)).setBuffer(buffer))
    .setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(new Float32Array(colors)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer));

  return prim;
}

// ---------------------------------------------------------------------------
// 6. Create Base Document with Single Atlas Material
// ---------------------------------------------------------------------------
function createBaseDocument(atlasBuffer) {
  const doc = new Document();
  const buffer = doc.createBuffer("main");
  const scene = doc.createScene("Scene");
  doc.getRoot().setDefaultScene(scene);

  const texture = doc.createTexture("atlas")
    .setImage(atlasBuffer)
    .setMimeType("image/png");

  const material = doc.createMaterial("AtlasMaterial")
    .setBaseColorTexture(texture)
    .setRoughnessFactor(0.8)
    .setMetallicFactor(0.1);

  return { doc, buffer, scene, material, texture };
}

// ---------------------------------------------------------------------------
// 7. Compose Stations, City, Props
// ---------------------------------------------------------------------------
async function main() {
  const atlasPath = await buildAtlas();
  const atlasBuffer = fs.readFileSync(atlasPath);

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });

  // Helper to load and clone primitives from a source GLB/GLTF into targetDoc
  async function loadSourcePrimitives(relPath, slotIdx, defaultUV = null, transform = null, targetDoc, targetBuffer, targetMat) {
    const fullPath = path.join(SRC_DIR, relPath);
    const srcDoc = await io.read(fullPath);
    const primitives = [];

    for (const mesh of srcDoc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const transferred = createTargetPrimitive(prim, targetDoc, targetBuffer, targetMat, slotIdx, defaultUV, transform);
        primitives.push(transferred);
      }
    }
    return primitives;
  }

  // -------------------------------------------------------------------------
  // Compose stations.glb
  // -------------------------------------------------------------------------
  console.log("Composing art/out/stations.glb...");
  const stationsBase = createBaseDocument(atlasBuffer);
  const stationsDoc = stationsBase.doc;
  const stationsMat = stationsBase.material;
  const stationsBuffer = stationsBase.buffer;

  const stationConfigs = [
    {
      name: "municipal_hq",
      sources: [
        { path: "kenney-city-kit-commercial/building-n.glb", slot: 0, transform: { scale: [1, 1, 1], translate: [0, 0, 0] } }
      ]
    },
    {
      name: "ward_office",
      sources: [
        { path: "kenney-city-kit-commercial/building-f.glb", slot: 0, transform: { scale: [1, 1, 1], translate: [0, 0, 0] } }
      ]
    },
    {
      name: "fire_services",
      sources: [
        { path: "kenney-city-kit-industrial/building-a.glb", slot: 2, transform: { scale: [0.95, 0.95, 0.95], translate: [0, 0, -0.2] } },
        { path: "kenney-car-kit/firetruck.glb", slot: 4, transform: { scale: [0.35, 0.35, 0.35], translate: [0.45, 0, 0.9], rotY: Math.PI } }
      ]
    },
    {
      name: "health_department",
      sources: [
        { path: "kenney-city-kit-commercial/building-h.glb", slot: 0, transform: { scale: [1, 1, 1], translate: [0, 0, -0.2] } },
        { path: "kenney-car-kit/ambulance.glb", slot: 4, transform: { scale: [0.35, 0.35, 0.35], translate: [0.45, 0, 0.9], rotY: Math.PI } }
      ]
    },
    {
      name: "revenue_office",
      sources: [
        { path: "kenney-city-kit-commercial/building-b.glb", slot: 0, transform: { scale: [1, 1, 1], translate: [0, 0, 0] } }
      ]
    },
    {
      name: "labour_department",
      sources: [
        { path: "kenney-city-kit-commercial/building-d.glb", slot: 0, transform: { scale: [1, 1, 1], translate: [0, 0, 0] } }
      ]
    },
    {
      name: "police",
      sources: [
        { path: "kenney-city-kit-commercial/building-c.glb", slot: 0, transform: { scale: [1, 1, 1], translate: [0, 0, -0.2] } },
        { path: "kenney-car-kit/police.glb", slot: 4, transform: { scale: [0.35, 0.35, 0.35], translate: [0.4, 0, 0.85], rotY: Math.PI } }
      ]
    },
    {
      name: "pollution_control_board",
      sources: [
        { path: "kenney-city-kit-industrial/building-b.glb", slot: 2, transform: { scale: [0.95, 0.95, 0.95], translate: [-0.2, 0, 0] } },
        { path: "kenney-city-kit-industrial/chimney-large.glb", slot: 2, transform: { scale: [0.7, 0.7, 0.7], translate: [0.9, 0, 0.2] } }
      ]
    },
    {
      name: "utility_provider",
      sources: [
        { path: "kenney-city-kit-industrial/water-tower.glb", slot: 2, transform: { scale: [0.95, 0.95, 0.95], translate: [-0.3, 0, 0] } },
        { path: "kenney-city-kit-industrial/detail-tank.glb", slot: 2, transform: { scale: [0.6, 0.6, 0.6], translate: [0.65, 0, 0.25] } }
      ]
    },
    {
      name: "court_or_notary",
      sources: [
        { path: "kenney-city-kit-commercial/building-a.glb", slot: 0, transform: { scale: [1, 1, 1], translate: [0, 0, 0] } }
      ]
    },
    {
      name: "other",
      sources: [
        { path: "kenney-city-kit-commercial/building-e.glb", slot: 0, transform: { scale: [1, 1, 1], translate: [0, 0, 0] } }
      ]
    }
  ];

  for (const cfg of stationConfigs) {
    const prims = [];
    for (const src of cfg.sources) {
      const srcPrims = await loadSourcePrimitives(src.path, src.slot, null, src.transform, stationsDoc, stationsBuffer, stationsMat);
      prims.push(...srcPrims);
    }
    const joined = prims.length > 1 ? joinPrimitives(prims) : prims[0];
    const mesh = stationsDoc.createMesh(cfg.name).addPrimitive(joined);
    const node = stationsDoc.createNode(cfg.name).setMesh(mesh);
    stationsBase.scene.addChild(node);
  }

  // 12. online_portal: procedural glass pavilion with emissive blue screen quad
  {
    const uvBase = SWATCH_UV_MAP.get("portal_glass");
    const uvPost = SWATCH_UV_MAP.get("iron_dark");
    const uvRoof = SWATCH_UV_MAP.get("concrete_warm");
    const uvScreen = SWATCH_UV_MAP.get("portal_screen");

    const pFoundation = createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.8, 0, -0.8], [0.8, 0.08, 0.8], uvBase);
    const pPost1 = createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.72, 0.08, -0.72], [-0.64, 1.4, -0.64], uvPost);
    const pPost2 = createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [0.64, 0.08, -0.72], [0.72, 1.4, -0.64], uvPost);
    const pPost3 = createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.72, 0.08, 0.64], [-0.64, 1.4, 0.72], uvPost);
    const pPost4 = createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [0.64, 0.08, 0.64], [0.72, 1.4, 0.72], uvPost);
    const pRoof = createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.8, 1.4, -0.8], [0.8, 1.5, 0.8], uvRoof);
    const pScreen = createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.45, 0.45, -0.03], [0.45, 1.15, 0.03], uvScreen);

    const joinedPortal = joinPrimitives([pFoundation, pPost1, pPost2, pPost3, pPost4, pRoof, pScreen]);
    const mesh = stationsDoc.createMesh("online_portal").addPrimitive(joinedPortal);
    const node = stationsDoc.createNode("online_portal").setMesh(mesh);
    stationsBase.scene.addChild(node);
  }

  // 13. milestone: procedural interchange plaza ring
  {
    const uvRing = SWATCH_UV_MAP.get("track_normal");
    const ringPrim = createRingPrismPrimitive(stationsDoc, stationsBuffer, stationsMat, 0.85, 1.25, 0.12, 16, uvRing);
    const mesh = stationsDoc.createMesh("milestone").addPrimitive(ringPrim);
    const node = stationsDoc.createNode("milestone").setMesh(mesh);
    stationsBase.scene.addChild(node);
  }

  const stationsPath = path.join(OUT_DIR, "stations.glb");
  await io.write(stationsPath, stationsDoc);
  console.log(`Saved stations.glb: ${stationsPath} (${(fs.statSync(stationsPath).size / 1024).toFixed(1)} KB)`);

  // -------------------------------------------------------------------------
  // Compose city.glb (18 building archetypes: low, mid, tall)
  // -------------------------------------------------------------------------
  console.log("Composing art/out/city.glb...");
  const cityBase = createBaseDocument(atlasBuffer);
  const cityDoc = cityBase.doc;
  const cityMat = cityBase.material;
  const cityBuffer = cityBase.buffer;

  const cityBuildingList = [
    // Low
    { name: "low-commercial-a", path: "kenney-city-kit-commercial/building-c.glb", slot: 0 },
    { name: "low-commercial-b", path: "kenney-city-kit-commercial/building-e.glb", slot: 0 },
    { name: "low-suburban-a", path: "kenney-city-kit-suburban/building-type-a.glb", slot: 1 },
    { name: "low-suburban-b", path: "kenney-city-kit-suburban/building-type-c.glb", slot: 1 },
    { name: "low-suburban-c", path: "kenney-city-kit-suburban/building-type-g.glb", slot: 1 },
    { name: "low-industrial-a", path: "kenney-city-kit-industrial/building-g.glb", slot: 2 },

    // Mid
    { name: "mid-commercial-a", path: "kenney-city-kit-commercial/building-d.glb", slot: 0 },
    { name: "mid-commercial-b", path: "kenney-city-kit-commercial/building-f.glb", slot: 0 },
    { name: "mid-commercial-c", path: "kenney-city-kit-commercial/building-h.glb", slot: 0 },
    { name: "mid-industrial-a", path: "kenney-city-kit-industrial/building-c.glb", slot: 2 },
    { name: "mid-industrial-b", path: "kenney-city-kit-industrial/building-e.glb", slot: 2 },
    { name: "mid-industrial-c", path: "kenney-city-kit-industrial/building-m.glb", slot: 2 },

    // Tall
    { name: "tall-commercial-a", path: "kenney-city-kit-commercial/building-l.glb", slot: 0 },
    { name: "tall-commercial-b", path: "kenney-city-kit-commercial/building-m.glb", slot: 0 },
    { name: "tall-skyscraper-a", path: "kenney-city-kit-commercial/building-skyscraper-a.glb", slot: 0 },
    { name: "tall-skyscraper-b", path: "kenney-city-kit-commercial/building-skyscraper-b.glb", slot: 0 },
    { name: "tall-skyscraper-c", path: "kenney-city-kit-commercial/building-skyscraper-c.glb", slot: 0 },
    { name: "tall-skyscraper-e", path: "kenney-city-kit-commercial/building-skyscraper-e.glb", slot: 0 },
  ];

  const cityKindsMetadata = [];

  for (const b of cityBuildingList) {
    const prims = await loadSourcePrimitives(b.path, b.slot, null, null, cityDoc, cityBuffer, cityMat);
    const joined = prims.length > 1 ? joinPrimitives(prims) : prims[0];
    const mesh = cityDoc.createMesh(b.name).addPrimitive(joined);
    const node = cityDoc.createNode(b.name).setMesh(mesh);
    cityBase.scene.addChild(node);

    // Calculate real bounding box
    const posArr = joined.getAttribute("POSITION").getArray();
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < posArr.length; i += 3) {
      minX = Math.min(minX, posArr[i]);
      minY = Math.min(minY, posArr[i + 1]);
      minZ = Math.min(minZ, posArr[i + 2]);
      maxX = Math.max(maxX, posArr[i]);
      maxY = Math.max(maxY, posArr[i + 1]);
      maxZ = Math.max(maxZ, posArr[i + 2]);
    }

    const width = +(maxX - minX).toFixed(2);
    const height = +(maxY - minY).toFixed(2);
    const depth = +(maxZ - minZ).toFixed(2);
    const tier = height <= 2.4 ? "low" : height <= 3.6 ? "mid" : "tall";
    const footprint = (width <= 1.75 && depth <= 1.75) ? "1x1" : "2x2";

    cityKindsMetadata.push({
      name: b.name,
      tier,
      footprint,
      width,
      height,
      depth,
    });
  }

  const cityPath = path.join(OUT_DIR, "city.glb");
  await io.write(cityPath, cityDoc);
  console.log(`Saved city.glb: ${cityPath} (${(fs.statSync(cityPath).size / 1024).toFixed(1)} KB)`);

  // -------------------------------------------------------------------------
  // Compose props.glb (13 nature & road & boat props)
  // -------------------------------------------------------------------------
  console.log("Composing art/out/props.glb...");
  const propsBase = createBaseDocument(atlasBuffer);
  const propsDoc = propsBase.doc;
  const propsMat = propsBase.material;
  const propsBuffer = propsBase.buffer;

  const propList = [
    // Trees
    { name: "tree-palm-tall", path: "kenney-nature-kit/tree_palmTall.glb", slot: -1, tier: "tree", defaultUV: SWATCH_UV_MAP.get("nature_green_palm") },
    { name: "tree-palm-short", path: "kenney-nature-kit/tree_palmShort.glb", slot: -1, tier: "tree", defaultUV: SWATCH_UV_MAP.get("nature_green_palm") },
    { name: "tree-palm-bend", path: "kenney-nature-kit/tree_palmBend.glb", slot: -1, tier: "tree", defaultUV: SWATCH_UV_MAP.get("nature_green_palm") },
    { name: "tree-oak", path: "kenney-nature-kit/tree_oak.glb", slot: -1, tier: "tree", defaultUV: SWATCH_UV_MAP.get("nature_green_leaf") },
    { name: "tree-simple", path: "kenney-nature-kit/tree_simple.glb", slot: -1, tier: "tree", defaultUV: SWATCH_UV_MAP.get("nature_green_forest") },
    { name: "tree-pine", path: "kenney-nature-kit/tree_pineDefaultA.glb", slot: -1, tier: "tree", defaultUV: SWATCH_UV_MAP.get("nature_green_dark") },
    { name: "tree-bush", path: "kenney-nature-kit/plant_bush.glb", slot: -1, tier: "tree", defaultUV: SWATCH_UV_MAP.get("nature_green_lime") },

    // Road props
    { name: "prop-light-single", path: "kenney-city-kit-roads/light-curved.glb", slot: 3, tier: "prop" },
    { name: "prop-light-double", path: "kenney-city-kit-roads/light-curved-double.glb", slot: 3, tier: "prop" },
    { name: "prop-barrier", path: "kenney-city-kit-roads/road-straight-barrier.glb", slot: 3, tier: "prop" },
    { name: "prop-traffic-light", path: "kenney-city-kit-roads/traffic-light.glb", slot: 3, tier: "prop" },

    // Boats
    { name: "prop-boat-small", path: "kenney-boats/boat-small.gltf", slot: -1, tier: "prop", defaultUV: SWATCH_UV_MAP.get("boat_hull") },
    { name: "prop-boat-large", path: "kenney-boats/boat-large.gltf", slot: -1, tier: "prop", defaultUV: SWATCH_UV_MAP.get("boat_deck") },
  ];

  for (const p of propList) {
    const prims = await loadSourcePrimitives(p.path, p.slot, p.defaultUV, null, propsDoc, propsBuffer, propsMat);
    const joined = prims.length > 1 ? joinPrimitives(prims) : prims[0];
    const mesh = propsDoc.createMesh(p.name).addPrimitive(joined);
    const node = propsDoc.createNode(p.name).setMesh(mesh);
    propsBase.scene.addChild(node);

    // Calculate real bounding box
    const posArr = joined.getAttribute("POSITION").getArray();
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < posArr.length; i += 3) {
      minX = Math.min(minX, posArr[i]);
      minY = Math.min(minY, posArr[i + 1]);
      minZ = Math.min(minZ, posArr[i + 2]);
      maxX = Math.max(maxX, posArr[i]);
      maxY = Math.max(maxY, posArr[i + 1]);
      maxZ = Math.max(maxZ, posArr[i + 2]);
    }

    const width = +(maxX - minX).toFixed(2);
    const height = +(maxY - minY).toFixed(2);
    const depth = +(maxZ - minZ).toFixed(2);

    cityKindsMetadata.push({
      name: p.name,
      tier: p.tier,
      footprint: (width <= 1.75 && depth <= 1.75) ? "1x1" : "2x2",
      width,
      height,
      depth,
    });
  }

  const propsPath = path.join(OUT_DIR, "props.glb");
  await io.write(propsPath, propsDoc);
  console.log(`Saved props.glb: ${propsPath} (${(fs.statSync(propsPath).size / 1024).toFixed(1)} KB)`);

  // -------------------------------------------------------------------------
  // 8. Generate components/canvas/city/cityKinds.ts (Amendment D3)
  // -------------------------------------------------------------------------
  console.log("Generating components/canvas/city/cityKinds.ts...");
  const cityKindsDir = path.join(ROOT, "components/canvas/city");
  if (!fs.existsSync(cityKindsDir)) {
    fs.mkdirSync(cityKindsDir, { recursive: true });
  }

  const cityKindsTsContent = `/**
 * City and Props Archetype Definitions (Generated by art/compose.mjs)
 *
 * Ground truth real bounding boxes, tiers, and footprints per visual-direction §3 and Amendment D3.
 */

export type CityTier = "low" | "mid" | "tall" | "tree" | "prop";
export type FootprintSize = "1x1" | "2x2";

export interface CityKindInfo {
  name: string;
  tier: CityTier;
  footprint: FootprintSize;
  width: number;
  height: number;
  depth: number;
}

export const CITY_KINDS: readonly CityKindInfo[] = ${JSON.stringify(cityKindsMetadata, null, 2)} as const;

export const CITY_KINDS_BY_NAME: Record<string, CityKindInfo> = Object.fromEntries(
  CITY_KINDS.map((k) => [k.name, k])
);

export function getCityKind(name: string): CityKindInfo | undefined {
  return CITY_KINDS_BY_NAME[name];
}

export const LOW_BUILDINGS = CITY_KINDS.filter((k) => k.tier === "low");
export const MID_BUILDINGS = CITY_KINDS.filter((k) => k.tier === "mid");
export const TALL_BUILDINGS = CITY_KINDS.filter((k) => k.tier === "tall");
export const TREES = CITY_KINDS.filter((k) => k.tier === "tree");
export const PROPS = CITY_KINDS.filter((k) => k.tier === "prop");
`;

  fs.writeFileSync(path.join(cityKindsDir, "cityKinds.ts"), cityKindsTsContent, "utf8");
  console.log("cityKinds.ts successfully written.");
  console.log("art:compose completed successfully!");
}

main().catch((err) => {
  console.error("art:compose failed:", err);
  process.exit(1);
});
