import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { joinPrimitives, weld, simplify } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
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
const SIGN_UV_MAP = new Map();

const SIGN_SLOTS = [
  { key: "municipal_hq", text: "CIVIC CENTRE" },
  { key: "ward_office", text: "WARD OFFICE" },
  { key: "revenue_office", text: "REVENUE OFFICE" },
  { key: "labour_department", text: "LABOUR OFFICE" },
  { key: "fire_services", text: "FIRE STATION" },
  { key: "police", text: "POLICE STATION" },
  { key: "health_department", text: "HEALTH OFFICE" },
  { key: "utility_provider", text: "UTILITY OFFICE" },
  { key: "pollution_control_board", text: "ENVIRONMENT BOARD" },
  { key: "court_or_notary", text: "COURT · NOTARY" },
  { key: "other", text: "OFFICE" },
  { key: "online_portal", text: "MONITOR" },
];

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
    let img;
    if (p.name === "roads") {
      // §11.5: Road colours from palette: PALETTE.road (#D6CCBA) and PALETTE.roadEdge (#C4B8A2), no lavender
      const { data, info } = await sharp(p.file).raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (b > r + 5 && b > g + 2 && r > 40 && r < 240) {
          const lum = (r + g + b) / 3;
          if (lum > 170) {
            // Kerb / pavement: PALETTE.roadEdge #C4B8A2
            data[i] = 196;
            data[i + 1] = 184;
            data[i + 2] = 162;
          } else {
            // Road surface: PALETTE.road #D6CCBA
            data[i] = 214;
            data[i + 1] = 204;
            data[i + 2] = 186;
          }
        }
      }
      img = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png();
    } else {
      img = sharp(p.file);
    }
    const padded = await img
      .resize(496, 496)
      .extend({ top: 8, bottom: 8, left: 8, right: 8, extendWith: "copy" })
      .toBuffer();
    composites.push({ input: padded, left: p.left, top: p.top });
  }

  // Slot 5 (Slot 6 in 1-based indexing): Swatches (y: 0..127) and Sign Plates (y: 128..511)
  const slotW = 512;
  const slotH = 512;
  const swatchRaw = Buffer.alloc(slotW * slotH * 4, 255);

  // Top 128 px: 16 cols x 4 rows of 32x32 color swatches
  const swatchCols = 16;
  const swatchCellSize = 32;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < swatchCols; c++) {
      const idx = r * swatchCols + c;
      const color = SWATCH_COLORS[idx] || { r: 255, g: 255, b: 255 };

      for (let y = 0; y < swatchCellSize; y++) {
        for (let x = 0; x < swatchCellSize; x++) {
          const px = c * swatchCellSize + x;
          const py = r * swatchCellSize + y;
          const offset = (py * slotW + px) * 4;
          swatchRaw[offset] = color.r;
          swatchRaw[offset + 1] = color.g;
          swatchRaw[offset + 2] = color.b;
          swatchRaw[offset + 3] = 255;
        }
      }

      // UV center coordinate in 1024x1536 atlas
      const cx = (c + 0.5) * swatchCellSize;
      const cy = (r + 0.5) * swatchCellSize;
      const u = (512 + cx) / 1024;
      const v = (1024 + cy) / 1536;

      SWATCH_UV_MAP.set(color.id, [u, v]);
      SWATCH_UV_MAP.set(`${color.r},${color.g},${color.b}`, [u, v]);
    }
  }

  // Bottom 384 px (y = 128..511): 12 slots of 256x64 px (2 cols x 6 rows)
  for (let i = 0; i < SIGN_SLOTS.length; i++) {
    const slot = SIGN_SLOTS[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const slotLeft = col * 256;
    const slotTop = 128 + row * 64;

    let svg;
    if (slot.key === "online_portal") {
      svg = `<svg width="256" height="64" xmlns="http://www.w3.org/2000/svg">
        <rect width="256" height="64" fill="#0A0F1D"/>
        <rect x="58" y="6" width="140" height="42" rx="4" fill="#1E293B" stroke="#38BDF8" stroke-width="2"/>
        <rect x="64" y="11" width="128" height="32" rx="2" fill="#0284C7"/>
        <polygon points="120,18 120,34 125,29 131,35 134,32 128,26 135,26" fill="#FFFFFF"/>
        <rect x="122" y="48" width="12" height="6" fill="#64748B"/>
        <rect x="112" y="54" width="32" height="4" rx="2" fill="#94A3B8"/>
      </svg>`;
    } else {
      svg = `<svg width="256" height="64" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="252" height="60" rx="4" fill="#F4EFE6" stroke="#C8BEAF" stroke-width="3"/>
        <text x="128" y="38" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#1E293B" text-anchor="middle" dominant-baseline="middle" letter-spacing="1.5">${slot.text}</text>
      </svg>`;
    }

    const rendered = await sharp(Buffer.from(svg)).raw().toBuffer();

    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 256; x++) {
        const destOffset = ((slotTop + y) * slotW + (slotLeft + x)) * 4;
        const srcOffset = (y * 256 + x) * 4;
        swatchRaw[destOffset] = rendered[srcOffset];
        swatchRaw[destOffset + 1] = rendered[srcOffset + 1];
        swatchRaw[destOffset + 2] = rendered[srcOffset + 2];
        swatchRaw[destOffset + 3] = rendered[srcOffset + 3];
      }
    }

    // Exact UV rectangle in 1024x1536 atlas with 2px inset
    const uMin = (512 + slotLeft + 2) / 1024;
    const uMax = (512 + slotLeft + 254) / 1024;
    const vMin = (1024 + slotTop + 2) / 1536;
    const vMax = (1024 + slotTop + 62) / 1536;

    SIGN_UV_MAP.set(slot.key, { uMin, uMax, vMin, vMax });
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
// 5. Procedural Primitives & Grounding
// ---------------------------------------------------------------------------
function groundPrimitive(prim) {
  const posAcc = prim.getAttribute("POSITION");
  const posArr = new Float32Array(posAcc.getArray());
  let minY = Infinity;
  for (let i = 1; i < posArr.length; i += 3) {
    if (posArr[i] < minY) minY = posArr[i];
  }
  if (Math.abs(minY) > 0.0001) {
    for (let i = 1; i < posArr.length; i += 3) {
      posArr[i] -= minY;
    }
    posAcc.setArray(posArr);
  }
  return minY;
}

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

  return doc.createPrimitive()
    .setMaterial(material)
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(uvs)).setBuffer(buffer))
    .setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(new Float32Array(colors)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer));
}

function createSignPlateBox(doc, buffer, material, min, max, signUV, creamUV) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;

  const positions = [
    // Front (+Z) - samples sign plate UV
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

  const uvs = [
    // Front (+Z): bottom-left, bottom-right, top-right, top-left
    signUV.uMin, signUV.vMax,
    signUV.uMax, signUV.vMax,
    signUV.uMax, signUV.vMin,
    signUV.uMin, signUV.vMin,
  ];

  // 5 remaining faces: cream swatch UV
  for (let i = 0; i < 20; i++) {
    uvs.push(creamUV[0], creamUV[1]);
  }

  const colors = new Float32Array(24 * 3).fill(1);
  const indices = [];
  for (let f = 0; f < 6; f++) {
    const o = f * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }

  return doc.createPrimitive()
    .setMaterial(material)
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(uvs)).setBuffer(buffer))
    .setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(colors).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer));
}

function createCylinderPrimitive(doc, buffer, material, r, height, segments, uv, baseCenter = [0, 0, 0]) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const [bx, by, bz] = baseCenter;

  // Side quads
  for (let i = 0; i < segments; i++) {
    const th0 = (i / segments) * Math.PI * 2;
    const th1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(th0), s0 = Math.sin(th0);
    const c1 = Math.cos(th1), s1 = Math.sin(th1);

    const o = positions.length / 3;
    positions.push(
      bx + r * c0, by,          bz + r * s0,
      bx + r * c1, by,          bz + r * s1,
      bx + r * c1, by + height, bz + r * s1,
      bx + r * c0, by + height, bz + r * s0
    );
    normals.push(
      c0, 0, s0,
      c1, 0, s1,
      c1, 0, s1,
      c0, 0, s0
    );
    for (let k = 0; k < 4; k++) uvs.push(uv[0], uv[1]);
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }

  // Top cap
  const topCenterIdx = positions.length / 3;
  positions.push(bx, by + height, bz);
  normals.push(0, 1, 0);
  uvs.push(uv[0], uv[1]);

  for (let i = 0; i < segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    positions.push(bx + r * Math.cos(th), by + height, bz + r * Math.sin(th));
    normals.push(0, 1, 0);
    uvs.push(uv[0], uv[1]);
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(topCenterIdx, topCenterIdx + 1 + i, topCenterIdx + 1 + next);
  }

  const colors = new Float32Array((positions.length / 3) * 3).fill(1);
  return doc.createPrimitive()
    .setMaterial(material)
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(uvs)).setBuffer(buffer))
    .setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(colors).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer));
}

function createDomePrimitive(doc, buffer, material, r, height, segments, rings, uv, center = [0, 0, 0]) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const [cx, cy, cz] = center;

  for (let ring = 0; ring <= rings; ring++) {
    const phi = (ring / rings) * (Math.PI / 2);
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const y = cy + height * cosPhi;
    const ringR = r * sinPhi;

    for (let seg = 0; seg <= segments; seg++) {
      const theta = (seg / segments) * Math.PI * 2;
      const x = cx + ringR * Math.cos(theta);
      const z = cz + ringR * Math.sin(theta);
      positions.push(x, y, z);
      normals.push(sinPhi * Math.cos(theta), cosPhi, sinPhi * Math.sin(theta));
      uvs.push(uv[0], uv[1]);
    }
  }

  for (let ring = 0; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = ring * (segments + 1) + seg;
      const b = a + 1;
      const c = (ring + 1) * (segments + 1) + seg;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const colors = new Float32Array((positions.length / 3) * 3).fill(1);
  return doc.createPrimitive()
    .setMaterial(material)
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(uvs)).setBuffer(buffer))
    .setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(colors).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer));
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

  return doc.createPrimitive()
    .setMaterial(material)
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(uvs)).setBuffer(buffer))
    .setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(new Float32Array(colors)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer));
}

// ---------------------------------------------------------------------------
// 6. Base Document Factory
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
// 7. Compose All GLBs
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

  const uvCream = SWATCH_UV_MAP.get("plaza_cream") || [0.5, 0.5];
  const uvConcrete = SWATCH_UV_MAP.get("concrete_warm") || [0.5, 0.5];
  const uvIron = SWATCH_UV_MAP.get("iron_dark") || [0.5, 0.5];
  const uvDark = SWATCH_UV_MAP.get("wood_dark") || [0.5, 0.5];

  const allTrianglesByKind = {};
  const stationMetadataList = [];
  const roadMetadataList = [];
  const carMetadataList = [];
  const cityKindsMetadata = [];

  // -------------------------------------------------------------------------
  // Compose stations.glb
  // -------------------------------------------------------------------------
  console.log("Composing art/out/stations.glb...");
  const stationsBase = createBaseDocument(atlasBuffer);
  const stationsDoc = stationsBase.doc;
  const stationsMat = stationsBase.material;
  const stationsBuffer = stationsBase.buffer;

  // 1. municipal_hq
  {
    const prims = await loadSourcePrimitives("kenney-city-kit-commercial/building-n.glb", 0, null, { scale: [1, 1, 1], translate: [0, 0, -0.15] }, stationsDoc, stationsBuffer, stationsMat);
    // 3 steps
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.7, 0, 0.7], [0.7, 0.08, 1.05], uvCream));
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.6, 0.08, 0.7], [0.6, 0.16, 1.0], uvCream));
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.5, 0.16, 0.7], [0.5, 0.24, 0.95], uvCream));
    // 4 columns
    for (const colX of [-0.45, -0.15, 0.15, 0.45]) {
      prims.push(createCylinderPrimitive(stationsDoc, stationsBuffer, stationsMat, 0.045, 1.1, 8, uvCream, [colX, 0.24, 0.82]));
    }
    // Entablature
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.55, 1.34, 0.72], [0.55, 1.46, 0.92], uvCream));
    // Drum & Dome
    prims.push(createCylinderPrimitive(stationsDoc, stationsBuffer, stationsMat, 0.42, 0.35, 12, uvConcrete, [0, 2.2, -0.15]));
    prims.push(createDomePrimitive(stationsDoc, stationsBuffer, stationsMat, 0.4, 0.5, 12, 6, uvCream, [0, 2.55, -0.15]));
    // Sign plate
    const signUV = SIGN_UV_MAP.get("municipal_hq");
    prims.push(createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [-0.45, 1.48, 0.92], [0.45, 1.72, 0.94], signUV, uvCream));

    const joined = joinPrimitives(prims);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("municipal_hq").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("municipal_hq").setMesh(mesh));
  }

  // 2. ward_office
  {
    const prims = await loadSourcePrimitives("kenney-city-kit-commercial/building-f.glb", 0, null, null, stationsDoc, stationsBuffer, stationsMat);
    // Clock tower on roof
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [0.15, 2.2, 0.15], [0.65, 3.1, 0.65], uvConcrete));
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [0.1, 3.1, 0.1], [0.7, 3.45, 0.7], uvCream));
    // Sign plate
    const signUV = SIGN_UV_MAP.get("ward_office");
    prims.push(createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [-0.4, 0.95, 0.82], [0.4, 1.17, 0.84], signUV, uvCream));

    const joined = joinPrimitives(prims);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("ward_office").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("ward_office").setMesh(mesh));
  }

  // 3. revenue_office
  {
    const prims = await loadSourcePrimitives("kenney-city-kit-commercial/building-b.glb", 0, null, null, stationsDoc, stationsBuffer, stationsMat);
    // 4 columns
    for (const colX of [-0.5, -0.17, 0.17, 0.5]) {
      prims.push(createCylinderPrimitive(stationsDoc, stationsBuffer, stationsMat, 0.045, 1.35, 8, uvCream, [colX, 0, 0.82]));
    }
    // Pediment overhang
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.58, 1.35, 0.72], [0.58, 1.48, 0.92], uvCream));
    // Sign plate
    const signUV = SIGN_UV_MAP.get("revenue_office");
    prims.push(createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [-0.45, 1.5, 0.90], [0.45, 1.72, 0.92], signUV, uvCream));

    const joined = joinPrimitives(prims);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("revenue_office").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("revenue_office").setMesh(mesh));
  }

  // 4. labour_department
  {
    const prims = await loadSourcePrimitives("kenney-city-kit-commercial/building-d.glb", 0, null, null, stationsDoc, stationsBuffer, stationsMat);
    // Rooftop structure to reach height >= 1.6
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.35, 1.37, -0.35], [0.35, 1.82, 0.35], uvConcrete));
    // Wide awning
    const awningPrims = await loadSourcePrimitives("kenney-city-kit-commercial/detail-awning-wide.glb", 0, null, { scale: [1, 1, 1], translate: [0, 0.8, 0.84] }, stationsDoc, stationsBuffer, stationsMat);
    prims.push(...awningPrims);
    // Sign plate
    const signUV = SIGN_UV_MAP.get("labour_department");
    prims.push(createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [-0.45, 1.15, 0.82], [0.45, 1.37, 0.84], signUV, uvCream));

    const joined = joinPrimitives(prims);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("labour_department").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("labour_department").setMesh(mesh));
  }

  // 5. fire_services
  {
    const prims = await loadSourcePrimitives("kenney-city-kit-industrial/building-a.glb", 2, null, { scale: [0.95, 0.95, 0.95], translate: [-0.15, 0, -0.15] }, stationsDoc, stationsBuffer, stationsMat);
    // Drill tower
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.75, 0, -0.75], [-0.35, 3.2, -0.35], uvIron));
    // Garage door panels (dark)
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.65, 0.02, 0.78], [-0.15, 0.75, 0.80], uvDark));
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.05, 0.02, 0.78], [0.45, 0.75, 0.80], uvDark));
    // Parked firetruck
    const carPrims = await loadSourcePrimitives("kenney-car-kit/firetruck.glb", 4, null, { scale: [0.35, 0.35, 0.35], translate: [0.55, 0, 0.8], rotY: Math.PI }, stationsDoc, stationsBuffer, stationsMat);
    prims.push(...carPrims);
    // Sign plate
    const signUV = SIGN_UV_MAP.get("fire_services");
    prims.push(createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [-0.45, 0.95, 0.80], [0.45, 1.17, 0.82], signUV, uvCream));

    const joined = joinPrimitives(prims);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("fire_services").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("fire_services").setMesh(mesh));
  }

  // 6. police
  {
    const prims = await loadSourcePrimitives("kenney-city-kit-commercial/building-c.glb", 0, null, { scale: [1, 1, 1], translate: [-0.15, 0, -0.15] }, stationsDoc, stationsBuffer, stationsMat);
    // Rooftop equipment / radio mast to reach height >= 1.6
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.35, 1.38, -0.35], [0.1, 1.78, 0.15], uvConcrete));
    prims.push(createCylinderPrimitive(stationsDoc, stationsBuffer, stationsMat, 0.02, 0.5, 6, uvIron, [0.25, 1.38, -0.2]));
    // Parked police car
    const carPrims = await loadSourcePrimitives("kenney-car-kit/police.glb", 4, null, { scale: [0.35, 0.35, 0.35], translate: [0.5, 0, 0.8], rotY: Math.PI }, stationsDoc, stationsBuffer, stationsMat);
    prims.push(...carPrims);
    // Sign plate
    const signUV = SIGN_UV_MAP.get("police");
    prims.push(createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [-0.45, 1.05, 0.80], [0.45, 1.27, 0.82], signUV, uvCream));

    const joined = joinPrimitives(prims);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("police").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("police").setMesh(mesh));
  }

  // 7. health_department
  {
    const prims = await loadSourcePrimitives("kenney-city-kit-commercial/building-h.glb", 0, null, { scale: [1, 1, 1], translate: [-0.15, 0, -0.15] }, stationsDoc, stationsBuffer, stationsMat);
    // Rooftop lantern structure to reach height >= 1.6
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.35, 1.43, -0.35], [0.35, 1.82, 0.35], uvConcrete));
    // Ambulance canopy
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [0.2, 0.85, 0.35], [0.85, 0.9, 1.15], uvConcrete));
    prims.push(createCylinderPrimitive(stationsDoc, stationsBuffer, stationsMat, 0.03, 0.85, 6, uvIron, [0.8, 0, 1.1]));
    // Parked ambulance
    const carPrims = await loadSourcePrimitives("kenney-car-kit/ambulance.glb", 4, null, { scale: [0.35, 0.35, 0.35], translate: [0.5, 0, 0.8], rotY: Math.PI }, stationsDoc, stationsBuffer, stationsMat);
    prims.push(...carPrims);
    // Sign plate
    const signUV = SIGN_UV_MAP.get("health_department");
    prims.push(createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [-0.45, 1.1, 0.80], [0.45, 1.32, 0.82], signUV, uvCream));

    const joined = joinPrimitives(prims);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("health_department").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("health_department").setMesh(mesh));
  }

  // 8. utility_provider
  {
    const prims = await loadSourcePrimitives("kenney-city-kit-industrial/water-tower.glb", 2, null, { scale: [0.75, 0.75, 0.75], translate: [-0.4, 0, -0.2] }, stationsDoc, stationsBuffer, stationsMat);
    const tankPrims = await loadSourcePrimitives("kenney-city-kit-industrial/detail-tank.glb", 2, null, { scale: [0.6, 0.6, 0.6], translate: [0.55, 0, 0.3] }, stationsDoc, stationsBuffer, stationsMat);
    prims.push(...tankPrims);
    // Substation office box
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [0.15, 0, -0.6], [0.85, 0.9, 0.0], uvConcrete));
    // Connecting pipe
    prims.push(createCylinderPrimitive(stationsDoc, stationsBuffer, stationsMat, 0.04, 0.6, 6, uvIron, [0.1, 0.2, -0.1]));
    // Sign plate
    const signUV = SIGN_UV_MAP.get("utility_provider");
    prims.push(createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [0.2, 0.65, 0.02], [0.8, 0.87, 0.04], signUV, uvCream));

    const joined = joinPrimitives(prims);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("utility_provider").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("utility_provider").setMesh(mesh));
  }

  // 9. pollution_control_board
  {
    const prims = await loadSourcePrimitives("kenney-city-kit-industrial/building-b.glb", 2, null, { scale: [0.95, 0.95, 0.95], translate: [-0.15, 0, 0] }, stationsDoc, stationsBuffer, stationsMat);
    const chimPrims = await loadSourcePrimitives("kenney-city-kit-industrial/chimney-large.glb", 2, null, { scale: [0.65, 0.65, 0.65], translate: [0.8, 0, 0.1] }, stationsDoc, stationsBuffer, stationsMat);
    prims.push(...chimPrims);
    // Roof garden green slab
    const uvGreen = SWATCH_UV_MAP.get("nature_green_dark") || uvCream;
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.65, 1.82, -0.55], [0.35, 1.86, 0.55], uvGreen));
    // Sign plate
    const signUV = SIGN_UV_MAP.get("pollution_control_board");
    prims.push(createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [-0.45, 1.1, 0.82], [0.45, 1.32, 0.84], signUV, uvCream));

    const joined = joinPrimitives(prims);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("pollution_control_board").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("pollution_control_board").setMesh(mesh));
  }

  // 10. court_or_notary
  {
    const prims = await loadSourcePrimitives("kenney-city-kit-commercial/building-a.glb", 0, null, null, stationsDoc, stationsBuffer, stationsMat);
    // 3 wide steps
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.8, 0, 0.7], [0.8, 0.08, 1.1], uvCream));
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.7, 0.08, 0.7], [0.7, 0.16, 1.05], uvCream));
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.6, 0.16, 0.7], [0.6, 0.24, 1.0], uvCream));
    // 4 classical columns
    for (const colX of [-0.5, -0.17, 0.17, 0.5]) {
      prims.push(createCylinderPrimitive(stationsDoc, stationsBuffer, stationsMat, 0.045, 1.25, 8, uvCream, [colX, 0.24, 0.85]));
    }
    // Pediment overhang
    prims.push(createBoxPrimitive(stationsDoc, stationsBuffer, stationsMat, [-0.6, 1.49, 0.75], [0.6, 1.62, 0.95], uvCream));
    // Sign plate
    const signUV = SIGN_UV_MAP.get("court_or_notary");
    prims.push(createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [-0.45, 1.64, 0.93], [0.45, 1.86, 0.95], signUV, uvCream));

    const joined = joinPrimitives(prims);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("court_or_notary").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("court_or_notary").setMesh(mesh));
  }

  // 11. other
  {
    const prims = await loadSourcePrimitives("kenney-city-kit-commercial/building-e.glb", 0, null, null, stationsDoc, stationsBuffer, stationsMat);
    const signUV = SIGN_UV_MAP.get("other");
    prims.push(createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [-0.35, 1.05, 0.82], [0.35, 1.27, 0.84], signUV, uvCream));

    const joined = joinPrimitives(prims);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("other").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("other").setMesh(mesh));
  }

  // 12. online_portal (Online kiosk per visual-direction §10.5)
  {
    const uvBase = SWATCH_UV_MAP.get("portal_glass");
    const uvBeam = SWATCH_UV_MAP.get("portal_screen");
    const signUV = SIGN_UV_MAP.get("online_portal");

    // Plaza base ring at y=0..0.06
    const pBase = createCylinderPrimitive(stationsDoc, stationsBuffer, stationsMat, 0.6, 0.06, 16, uvBase);
    // Light beam cylinder from ground to floating screen
    const pBeam = createCylinderPrimitive(stationsDoc, stationsBuffer, stationsMat, 0.06, 1.64, 12, uvBeam, [0, 0.06, 0]);
    // Floating screen slab: 1.6 x 1.0 x 0.12 at y = 1.7..2.7 (center y=2.2)
    const pScreen = createSignPlateBox(stationsDoc, stationsBuffer, stationsMat, [-0.8, 1.7, -0.06], [0.8, 2.7, 0.06], signUV, uvBase);

    const joined = joinPrimitives([pBase, pBeam, pScreen]);
    groundPrimitive(joined);
    const mesh = stationsDoc.createMesh("online_portal").addPrimitive(joined);
    stationsBase.scene.addChild(stationsDoc.createNode("online_portal").setMesh(mesh));
  }

  // 13. milestone (Interchange plaza ring)
  {
    const uvRing = SWATCH_UV_MAP.get("track_normal");
    const ringPrim = createRingPrismPrimitive(stationsDoc, stationsBuffer, stationsMat, 0.85, 1.25, 0.12, 16, uvRing);
    groundPrimitive(ringPrim);
    const mesh = stationsDoc.createMesh("milestone").addPrimitive(ringPrim);
    stationsBase.scene.addChild(stationsDoc.createNode("milestone").setMesh(mesh));
  }

  // Measure and register stations
  for (const mesh of stationsDoc.getRoot().listMeshes()) {
    const name = mesh.getName();
    const prim = mesh.listPrimitives()[0];
    const posArr = prim.getAttribute("POSITION").getArray();
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
    const indices = prim.getIndices();
    const triangles = indices ? Math.floor(indices.getCount() / 3) : Math.floor(posArr.length / 9);

    allTrianglesByKind[name] = triangles;
    stationMetadataList.push({ name, width, height, depth, triangles, minY: +minY.toFixed(4) });
    console.log(`Station composite '${name}': ${width}x${height}x${depth}, ${triangles} tris, minY=${minY.toFixed(4)}`);
  }

  const stationsPath = path.join(OUT_DIR, "stations.glb");
  await io.write(stationsPath, stationsDoc);
  console.log(`Saved stations.glb: ${stationsPath} (${(fs.statSync(stationsPath).size / 1024).toFixed(1)} KB)`);

  // -------------------------------------------------------------------------
  // Compose city.glb (18 building archetypes: low, mid, tall, low-detail)
  // -------------------------------------------------------------------------
  console.log("Composing art/out/city.glb...");
  const cityBase = createBaseDocument(atlasBuffer);
  const cityDoc = cityBase.doc;
  const cityMat = cityBase.material;
  const cityBuffer = cityBase.buffer;

  const cityBuildingList = [
    // Low (16 variants)
    { name: "suburban-a", path: "kenney-city-kit-suburban/building-type-a.glb", slot: 1, tier: "low" },
    { name: "suburban-b", path: "kenney-city-kit-suburban/building-type-b.glb", slot: 1, tier: "low" },
    { name: "suburban-c", path: "kenney-city-kit-suburban/building-type-c.glb", slot: 1, tier: "low" },
    { name: "suburban-d", path: "kenney-city-kit-suburban/building-type-d.glb", slot: 1, tier: "low" },
    { name: "suburban-e", path: "kenney-city-kit-suburban/building-type-e.glb", slot: 1, tier: "low" },
    { name: "suburban-f", path: "kenney-city-kit-suburban/building-type-f.glb", slot: 1, tier: "low" },
    { name: "suburban-g", path: "kenney-city-kit-suburban/building-type-g.glb", slot: 1, tier: "low" },
    { name: "suburban-h", path: "kenney-city-kit-suburban/building-type-h.glb", slot: 1, tier: "low" },
    { name: "suburban-i", path: "kenney-city-kit-suburban/building-type-i.glb", slot: 1, tier: "low" },
    { name: "suburban-j", path: "kenney-city-kit-suburban/building-type-j.glb", slot: 1, tier: "low" },
    { name: "low-commercial-a", path: "kenney-city-kit-commercial/building-c.glb", slot: 0, tier: "low" },
    { name: "low-commercial-b", path: "kenney-city-kit-commercial/building-e.glb", slot: 0, tier: "low" },
    { name: "low-commercial-c", path: "kenney-city-kit-commercial/building-a.glb", slot: 0, tier: "low" },
    { name: "low-commercial-d", path: "kenney-city-kit-commercial/building-b.glb", slot: 0, tier: "low" },
    { name: "low-industrial-a", path: "kenney-city-kit-industrial/building-g.glb", slot: 2, tier: "low" },
    { name: "low-industrial-b", path: "kenney-city-kit-industrial/building-r.glb", slot: 2, tier: "low" },

    // Mid (10 variants)
    { name: "mid-commercial-a", path: "kenney-city-kit-commercial/building-d.glb", slot: 0, tier: "mid" },
    { name: "mid-commercial-b", path: "kenney-city-kit-commercial/building-f.glb", slot: 0, tier: "mid" },
    { name: "mid-commercial-c", path: "kenney-city-kit-commercial/building-h.glb", slot: 0, tier: "mid" },
    { name: "mid-commercial-d", path: "kenney-city-kit-commercial/building-i.glb", slot: 0, tier: "mid" },
    { name: "mid-commercial-e", path: "kenney-city-kit-commercial/building-j.glb", slot: 0, tier: "mid" },
    { name: "mid-commercial-f", path: "kenney-city-kit-commercial/building-k.glb", slot: 0, tier: "mid" },
    { name: "mid-industrial-a", path: "kenney-city-kit-industrial/building-c.glb", slot: 2, tier: "mid" },
    { name: "mid-industrial-b", path: "kenney-city-kit-industrial/building-e.glb", slot: 2, tier: "mid" },
    { name: "mid-industrial-c", path: "kenney-city-kit-industrial/building-m.glb", slot: 2, tier: "mid" },
    { name: "mid-industrial-d", path: "kenney-city-kit-industrial/building-n.glb", slot: 2, tier: "mid" },

    // Tall & Low-Detail (17 variants)
    { name: "low-detail-a", path: "kenney-city-kit-commercial/low-detail-building-a.glb", slot: 0, tier: "tall" },
    { name: "low-detail-b", path: "kenney-city-kit-commercial/low-detail-building-b.glb", slot: 0, tier: "tall" },
    { name: "low-detail-c", path: "kenney-city-kit-commercial/low-detail-building-c.glb", slot: 0, tier: "tall" },
    { name: "low-detail-d", path: "kenney-city-kit-commercial/low-detail-building-d.glb", slot: 0, tier: "tall" },
    { name: "low-detail-e", path: "kenney-city-kit-commercial/low-detail-building-e.glb", slot: 0, tier: "tall" },
    { name: "low-detail-f", path: "kenney-city-kit-commercial/low-detail-building-f.glb", slot: 0, tier: "tall" },
    { name: "low-detail-g", path: "kenney-city-kit-commercial/low-detail-building-g.glb", slot: 0, tier: "tall" },
    { name: "low-detail-h", path: "kenney-city-kit-commercial/low-detail-building-h.glb", slot: 0, tier: "tall" },
    { name: "low-detail-i", path: "kenney-city-kit-commercial/low-detail-building-i.glb", slot: 0, tier: "tall" },
    { name: "low-detail-j", path: "kenney-city-kit-commercial/low-detail-building-j.glb", slot: 0, tier: "tall" },
    { name: "low-detail-k", path: "kenney-city-kit-commercial/low-detail-building-k.glb", slot: 0, tier: "tall" },
    { name: "low-detail-l", path: "kenney-city-kit-commercial/low-detail-building-l.glb", slot: 0, tier: "tall" },
    { name: "low-detail-m", path: "kenney-city-kit-commercial/low-detail-building-m.glb", slot: 0, tier: "tall" },
    { name: "low-detail-n", path: "kenney-city-kit-commercial/low-detail-building-n.glb", slot: 0, tier: "tall" },
    { name: "tall-skyscraper-a", path: "kenney-city-kit-commercial/building-skyscraper-a.glb", slot: 0, tier: "tall" },
    { name: "tall-skyscraper-b", path: "kenney-city-kit-commercial/building-skyscraper-b.glb", slot: 0, tier: "tall" },
    { name: "tall-skyscraper-c", path: "kenney-city-kit-commercial/building-skyscraper-c.glb", slot: 0, tier: "tall" },
  ];

  for (const b of cityBuildingList) {
    const prims = await loadSourcePrimitives(b.path, b.slot, null, null, cityDoc, cityBuffer, cityMat);
    const joined = prims.length > 1 ? joinPrimitives(prims) : prims[0];
    groundPrimitive(joined);
    const mesh = cityDoc.createMesh(b.name).addPrimitive(joined);
    cityBase.scene.addChild(cityDoc.createNode(b.name).setMesh(mesh));

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
    const tier = b.tier || (height <= 2.4 ? "low" : height <= 3.6 ? "mid" : "tall");
    const footprint = (width <= 1.75 && depth <= 1.75) ? "1x1" : "2x2";
    const indices = joined.getIndices();
    const triangles = indices ? Math.floor(indices.getCount() / 3) : Math.floor(posArr.length / 9);

    allTrianglesByKind[b.name] = triangles;
    cityKindsMetadata.push({
      name: b.name,
      tier,
      footprint,
      width,
      height,
      depth,
      triangles,
    });
  }

  const cityPath = path.join(OUT_DIR, "city.glb");
  await io.write(cityPath, cityDoc);
  console.log(`Saved city.glb: ${cityPath} (${(fs.statSync(cityPath).size / 1024).toFixed(1)} KB)`);

  // -------------------------------------------------------------------------
  // Compose props.glb (Nature, street furniture, boats)
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
    { name: "prop-light-square", path: "kenney-city-kit-roads/light-square.glb", slot: 3, tier: "prop" },
    { name: "prop-barrier", path: "kenney-city-kit-roads/road-straight-barrier.glb", slot: 3, tier: "prop" },
    { name: "prop-traffic-light", path: "kenney-city-kit-roads/traffic-light.glb", slot: 3, tier: "prop" },

    // Boats
    { name: "prop-boat-small", path: "kenney-boats/boat-small.gltf", slot: -1, tier: "prop", defaultUV: SWATCH_UV_MAP.get("boat_hull") },
    { name: "prop-boat-large", path: "kenney-boats/boat-large.gltf", slot: -1, tier: "prop", defaultUV: SWATCH_UV_MAP.get("boat_deck") },
  ];

  for (const p of propList) {
    const prims = await loadSourcePrimitives(p.path, p.slot, p.defaultUV, null, propsDoc, propsBuffer, propsMat);
    const joined = prims.length > 1 ? joinPrimitives(prims) : prims[0];
    groundPrimitive(joined);
    const mesh = propsDoc.createMesh(p.name).addPrimitive(joined);
    propsBase.scene.addChild(propsDoc.createNode(p.name).setMesh(mesh));

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
    const indices = joined.getIndices();
    const triangles = indices ? Math.floor(indices.getCount() / 3) : Math.floor(posArr.length / 9);

    allTrianglesByKind[p.name] = triangles;
    cityKindsMetadata.push({
      name: p.name,
      tier: p.tier,
      footprint: (width <= 1.75 && depth <= 1.75) ? "1x1" : "2x2",
      width,
      height,
      depth,
      triangles,
    });
  }

  const propsPath = path.join(OUT_DIR, "props.glb");
  await io.write(propsPath, propsDoc);
  console.log(`Saved props.glb: ${propsPath} (${(fs.statSync(propsPath).size / 1024).toFixed(1)} KB)`);

  // -------------------------------------------------------------------------
  // Compose roads.glb (Road tiles for street grid per §10.2)
  // -------------------------------------------------------------------------
  console.log("Composing art/out/roads.glb...");
  const roadsBase = createBaseDocument(atlasBuffer);
  const roadsDoc = roadsBase.doc;
  const roadsMat = roadsBase.material;
  const roadsBuffer = roadsBase.buffer;

  const roadList = [
    { name: "road-straight", file: "road-straight.glb" },
    { name: "road-bend", file: "road-bend.glb" },
    { name: "road-intersection", file: "road-intersection.glb" },
    { name: "road-crossroad", file: "road-crossroad.glb" },
    { name: "road-end", file: "road-end.glb" },
    { name: "road-side", file: "road-side.glb" },
  ];

  for (const r of roadList) {
    const prims = await loadSourcePrimitives(`kenney-city-kit-roads/${r.file}`, 3, null, null, roadsDoc, roadsBuffer, roadsMat);
    const joined = prims.length > 1 ? joinPrimitives(prims) : prims[0];
    groundPrimitive(joined);
    const mesh = roadsDoc.createMesh(r.name).addPrimitive(joined);
    roadsBase.scene.addChild(roadsDoc.createNode(r.name).setMesh(mesh));

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
    const indices = joined.getIndices();
    const triangles = indices ? Math.floor(indices.getCount() / 3) : Math.floor(posArr.length / 9);

    allTrianglesByKind[r.name] = triangles;
    roadMetadataList.push({ name: r.name, width, height, depth, triangles, minY: +minY.toFixed(4) });
  }

  const roadsPath = path.join(OUT_DIR, "roads.glb");
  await io.write(roadsPath, roadsDoc);
  console.log(`Saved roads.glb: ${roadsPath} (${(fs.statSync(roadsPath).size / 1024).toFixed(1)} KB)`);

  // -------------------------------------------------------------------------
  // Compose cars.glb (Cars & service vehicles per §10.3)
  // -------------------------------------------------------------------------
  console.log("Composing art/out/cars.glb...");
  const carsBase = createBaseDocument(atlasBuffer);
  const carsDoc = carsBase.doc;
  const carsMat = carsBase.material;
  const carsBuffer = carsBase.buffer;

  const carList = [
    { name: "sedan", file: "sedan.glb" },
    { name: "taxi", file: "taxi.glb" },
    { name: "van", file: "van.glb" },
    { name: "suv", file: "suv.glb" },
    { name: "hatchback-sports", file: "hatchback-sports.glb" },
    { name: "delivery", file: "delivery.glb" },
    { name: "truck", file: "truck.glb" },
    { name: "garbage-truck", file: "garbage-truck.glb" },
    { name: "firetruck", file: "firetruck.glb" },
    { name: "police", file: "police.glb" },
    { name: "ambulance", file: "ambulance.glb" },
  ];

  let totalCarTris = 0;
  for (const c of carList) {
    const prims = await loadSourcePrimitives(`kenney-car-kit/${c.file}`, 4, null, null, carsDoc, carsBuffer, carsMat);
    const joined = prims.length > 1 ? joinPrimitives(prims) : prims[0];
    groundPrimitive(joined);
    const mesh = carsDoc.createMesh(c.name).addPrimitive(joined);
    carsBase.scene.addChild(carsDoc.createNode(c.name).setMesh(mesh));

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
    const indices = joined.getIndices();
    const triangles = indices ? Math.floor(indices.getCount() / 3) : Math.floor(posArr.length / 9);

    totalCarTris += triangles;
    allTrianglesByKind[c.name] = triangles;
    carMetadataList.push({ name: c.name, width, height, depth, triangles, minY: +minY.toFixed(4) });
  }

  // Simplify cars to guarantee budget <= 25k triangles
  await carsDoc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.85, error: 0.01 }));

  // Re-read triangle count after simplification
  totalCarTris = 0;
  for (const mesh of carsDoc.getRoot().listMeshes()) {
    const prim = mesh.listPrimitives()[0];
    const tris = Math.floor(prim.getIndices().getCount() / 3);
    allTrianglesByKind[mesh.getName()] = tris;
    const meta = carMetadataList.find((m) => m.name === mesh.getName());
    if (meta) meta.triangles = tris;
    totalCarTris += tris;
  }
  console.log(`Cars total triangles after simplification: ${totalCarTris} (budget <= 25000)`);

  const carsPath = path.join(OUT_DIR, "cars.glb");
  await io.write(carsPath, carsDoc);
  console.log(`Saved cars.glb: ${carsPath} (${(fs.statSync(carsPath).size / 1024).toFixed(1)} KB)`);

  // -------------------------------------------------------------------------
  // 8. Generate components/canvas/city/cityKinds.ts
  // -------------------------------------------------------------------------
  console.log("Generating components/canvas/city/cityKinds.ts...");
  const cityKindsDir = path.join(ROOT, "components/canvas/city");
  if (!fs.existsSync(cityKindsDir)) {
    fs.mkdirSync(cityKindsDir, { recursive: true });
  }

  const cityKindsTsContent = `/**
 * City, Props, Road, Car and Station Archetype Definitions
 * (Generated by art/compose.mjs per visual-direction §10.1, §10.5)
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
  triangles: number;
}

export interface ModelKindInfo {
  name: string;
  width: number;
  height: number;
  depth: number;
  triangles: number;
  minY: number;
}

export const CITY_KINDS: readonly CityKindInfo[] = ${JSON.stringify(cityKindsMetadata, null, 2)} as const;

export const STATION_KINDS: readonly ModelKindInfo[] = ${JSON.stringify(stationMetadataList, null, 2)} as const;
export const ROAD_KINDS: readonly ModelKindInfo[] = ${JSON.stringify(roadMetadataList, null, 2)} as const;
export const CAR_KINDS: readonly ModelKindInfo[] = ${JSON.stringify(carMetadataList, null, 2)} as const;

export const CITY_KINDS_BY_NAME: Record<string, CityKindInfo> = Object.fromEntries(
  CITY_KINDS.map((k) => [k.name, k])
);

export const TRIANGLES_BY_KIND: Record<string, number> = ${JSON.stringify(allTrianglesByKind, null, 2)};

export function getCityKind(name: string): CityKindInfo | undefined {
  return CITY_KINDS_BY_NAME[name];
}

export const LOW_BUILDINGS = CITY_KINDS.filter((k) => k.tier === "low");
export const MID_BUILDINGS = CITY_KINDS.filter((k) => k.tier === "mid");
export const TALL_BUILDINGS = CITY_KINDS.filter((k) => k.tier === "tall");
export const LOW_DETAIL_BUILDINGS = CITY_KINDS.filter((k) => k.name.startsWith("low-detail-"));
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
