# Civic Metro · Visual direction v2 ("City diorama", light)

Status: **normative** for colours, typography, the look of the 3D scene, 3D assets and the scene overlays.
It supersedes these parts of `docs/frontend-spec.md`: "Colour tokens", the ground/lighting/station-tint rules in "3D scene", the dark frosted HUD styling, and the draw-call budget line.
Everything else in `frontend-spec.md` (layout maths, interaction, keyboard map, motion timings, reduced motion, 2D rules) stays normative unless this file says otherwise.

Reference image: `docs/reference/civic-metro-target.jpg`. It is AI concept art. Match its **composition and UI language**, not its photorealism. The target is a stylised low-poly diorama that stays at 60 fps on a laptop.

Never copy from the reference: real government logos, emblems or seals; the red-cross symbol (protected emblem); photographs; any fee, date, time or URL printed in it. Every number, date and link in the UI comes from data, and "Verified on …" appears only when the step's review data says so.

---

## 1. What we are matching

- **UI**: light, warm "civic paper" look. Cream page, white cards (radius 12 px, 1 px border, soft shadow), a brick-red brand colour, Geist Sans.
- **3D**: an isometric diorama of a coastal city with a Mumbai flavour:
  - sea along the camera-facing edge, with a promenade road;
  - palms, a heritage domed municipal building, a suburban rail line with a local train, and a few boats.
- **Stations**: stations are distinct office buildings, each on a small plaza. Every station has a floating label card: an icon circle coloured by state, the title, and the mode ("Online" / "In-person").
- **Routes**: route lines run along roads between stations:
  - the next available route is blue with moving pulses;
  - done routes are green;
  - the critical path is red (while the toggle is on);
  - conditional routes are dashed amber.
- **Scene overlays**: a stage header per layer across the top of the scene ("1 · Start here", "2 · In parallel (3)" …). A legend bar along the bottom-left.
- **Later milestones** (see §8): the summary bar, right drawer, left navigation, 2D view and office trip plan.

## 2. Tokens

Defined once as CSS variables in `app/globals.css` and mirrored in `components/canvas/palette.ts`. The palette test asserts they match. There are no raw hex values anywhere else.

| Token | Value | Use |
|---|---|---|
| `--cw-background` | `#F5EFE3` | page, scene clear colour |
| `--cw-surface` | `#FFFFFF` | cards, drawer, labels |
| `--cw-surface-muted` | `#FBF7EF` | secondary panels, hover |
| `--cw-border` | `#E4DACA` | 1 px borders, dividers |
| `--cw-text` | `#1D1A16` | primary text |
| `--cw-text-muted` | `#5E574D` | secondary text |
| `--cw-brand` | `#B3261E` | primary buttons, logo, focus ring |
| `--cw-done` | `#1E7F3B` | done state |
| `--cw-available` | `#1F63D6` | available (next) state, next-up routes |
| `--cw-locked` | `#6B7078` | locked state |
| `--cw-undecided` | `#B45309` | may-apply / conditional (text and icons) |
| `--cw-attention` | `#D97706` | needs attention (review flags, FE-4+) |
| `--cw-critical` | `#D92D20` | critical path |
| `--cw-error` | `#B42318` | errors |

Contrast, checked:

| Pair | Ratio |
|---|---|
| text / background | 15.1 |
| text-muted / surface | 7.1 |
| white on brand | 6.5 |
| white on done | 5.1 |
| white on available | 5.5 |
| white on locked | 5.0 |
| white on undecided | 5.0 |
| attention / surface | 3.2 (non-text only) |
| critical / land | 3.7 (non-text only) |

Scene-only colours (`palette.ts` only):

| Name | Value |
|---|---|
| seaDeep | `#4E97AE` |
| seaShallow | `#8CC3D1` |
| land | `#E6DFD2` |
| park | `#B7CF95` |
| road | `#D6CCBA` |
| roadEdge | `#C4B8A2` |
| plaza | `#F2EBDD` |
| slabSide | `#D9C9A8` |
| sky / fog | `#F3ECDF` |
| sun | `#FFE6C0` |
| hemiSky | `#FFF6E8` |
| hemiGround | `#C9B794` |
| trackNormal | `#9AA3AD` |

- The demo is light-only: remove the `dark` class from `<html>`.
- The shadcn components keep working through their CSS variables, which are mapped onto the tokens above.
- Font: `--font-sans` must point at `var(--font-geist-sans)`. Today it points at itself, so every page renders in a serif fallback.

## 3. Scene composition

**World and layout**
- Station x/z come from `computeMetroLayout` (x = layer × 7, z = lane offset × 4.5).
- Stations stand on the ground. `position3D[1]` is used only as the label height offset, so online labels float slightly higher.
- `lib/graph` and its tests don't change.
- Online steps no longer float or have drop lines. They are shown by the `online_portal` building (a glowing screen), the "Online" label and a small screen glow.

**Diorama board**
- Bounds: the station bounds plus a 14-unit margin on every side, rounded up to 7-unit blocks.
- Ground: a rounded-corner slab 0.6 thick (land on top, `slabSide` on the edges).
- Sea: a band 10 units deep along the +z (camera-facing) edge, with the promenade road on its shore.
- Rail line: along the −z (back) edge.

**City fill**
- `components/canvas/city/planCity.ts` is pure TypeScript with no three import, and is deterministic.
- Grid of 1.75-unit cells over the land. Each cell is exactly one of:
  - `plaza`: within 1.6 units of a station centre;
  - `road`: within 0.9 units of any sampled track curve, or on the promenade;
  - `water`;
  - `park`: seeded clusters, about 8 % of free cells;
  - `building`: everything else.
- Building kind by distance to the nearest station:
  - under 5 units: low-rise shops;
  - 5–12 units: mid-rise;
  - more than 12 units: tall towers (these form the skyline at the back).
- Variant, 90° rotation and scale jitter (0.9–1.1) come from mulberry32 seeded with a hash of `taskId + ":city"`.
- Caps: buildings ≤ 260, trees ≤ 180, props (boats, benches, lamps, rail cars) ≤ 40. Palms along the promenade and roads every second cell.
- Tests:
  - the same seed gives the same output;
  - no building cell overlaps a plaza or a road corridor;
  - counts stay under the caps;
  - a different taskId gives a different layout;
  - planning the stress graph takes under 30 ms.

**Rendering the fill**
- One `THREE.BatchedMesh` for all buildings. Every kit building geometry is registered once and they share one atlas material.
- One `BatchedMesh` for trees and props.
- Both cast and receive shadows, and have `raycast` disabled.
- Roads: one merged ribbon mesh along the sampled track curves (width 1.1, y 0.02) plus the promenade, and one kerb mesh.
- Water: one plane with a small custom shader (two scrolling sine bands, fresnel toward the fog colour). No reflections. Static under reduced motion.
- Local train: one small instanced set moving along the rail. It is P2: skip it if time is short.

**Stations**
- One hero building per `officeType` plus the milestone, instanced per archetype (≤ 13 draw calls), in their natural colours.
- Size: footprint ≤ 2.6 × 2.6, height 1.6–4.2. The milestone stays ≤ 0.3 high.
- State appears in four places:
  - Plaza ring: one instanced `RingGeometry(1.25, 1.45, 64)` on each plaza.
    - done `--cw-done`, available `--cw-available`, locked `--cw-locked`.
    - may-apply `--cw-undecided` with a dashed-ring alpha texture.
    - `toneMapped={false}` at 1.4× so only rings, beacons, pulses and screens bloom.
  - Next-up beacon: one instanced open cylinder (r 1.2, h 6, additive, opacity 0.18, gradient fading upward) on available non-optional stations.
  - Locked buildings are multiplied by 0.82 grey with `setColorAt`, so they look quieter.
  - Selected: one extra plain `Mesh` of the selected archetype's geometry, placed at the selected station, with a drei `<Outlines>` child (thickness 0.03, colour `--cw-brand`). Don't put the outline on the InstancedMesh.

**Routes**
- Keep drei `<Line segments>` batches, y = 0.25 above the road. Four batches:
  - normal (`trackNormal`, width 4);
  - done (`--cw-done`, width 4);
  - next-up and critical (`--cw-available` width 5, or `--cw-critical` width 6 while the toggle is on);
  - dashed (`--cw-undecided`, width 3).
- Pulses: white spheres r 0.14 on routes into available stations, at the existing speed. None under reduced motion.

## 4. Overlays (DOM, outside the canvas)

**Labels**
- `components/canvas/labels/`: a projector inside the Canvas plus a DOM layer outside it. This replaces drei `<Html>`, which triggers React 19's "synchronously unmount a root" error.
- The projector recomputes screen positions only when the camera matrix or the layout changes, and writes `style.transform = translate3d(x, y, 0)` straight to refs. No React state per frame.
- Hide a label when its station is behind the camera or outside the viewport by more than 40 px.
- Card: white, radius 10, 1 px border, shadow `0 2px 8px rgb(0 0 0 / 0.08)`.
  - A 28 px icon circle:
    - done: green with a check;
    - available: blue with the office icon;
    - locked: grey with a lock;
    - may-apply: amber dashed outline;
    - milestone: ring icon.
  - Title at 13 px/600, mode at 11 px `--cw-text-muted`.
  - A 1 px tether line to the building top.
- Which labels show:
  - ≤ 16 stations: all of them.
  - Above 16: next-up, hovered, focused, selected and the last done, then greedy collision culling by that priority.
- Labels are real buttons (`aria-label` "<title>, <state>") that select the station. Focus stays in sync with `useViewStore.focusedStepId`.

**Stage headers**
- One per layer, projected from the layer's x at the back edge of the board.
- Text is derived: "1 · Start here" for layer 0, "N · In parallel (k)" when a layer has more than one station, otherwise "N · Then".
- No invented stage names. They can come from template data later.

**Legend**
- Bottom-left of the scene: Completed · Available (next) · Locked · Conditional (may apply) · Critical path (only while the toggle is on).
- "Needs attention" arrives with review flags in FE-4.

## 5. Lighting, post-processing, camera

**Lighting**
- `hemisphereLight` (hemiSky, hemiGround, 1.1).
- One `directionalLight` from (−18, 30, 22), colour `sun`, intensity 2.4:
  - `castShadow`, 2048² map, `PCFShadowMap`, bias −0.0004, normalBias 0.02;
  - an orthographic shadow camera refitted to the board bounds whenever the layout changes.
- No runtime HDRI. If reflections look flat, use a 1k CC0 HDRI self-hosted in `public/env/` at intensity 0.35. Never load from a CDN.

**Renderer**
- `toneMapping = THREE.NeutralToneMapping`, exposure 1.0 (it keeps UI colours true).
- Clear colour: sky.
- `THREE.Fog(sky, 60, 160)`.

**Post-processing**
- `<EffectComposer multisampling={4}>` with Bloom only (luminanceThreshold 1.0, intensity 0.6, mipmapBlur).
- No vignette. No SSAO: ambient occlusion is baked into vertex colours.
- PerformanceMonitor degrades in this order: Bloom off → dpr 1 → shadow map 1024 → hide props.

**Camera**
- Perspective, fov 28 (a flatter isometric feel), initial azimuth −35°, polar 52°.
- `fitToBox` over the **station** bounds with padding 1.2.
- Distance 10–120, max polar 70° (never show the board's underside).
- `setBoundary` on the board bounds.
- Selection: `setLookAt(station + (7, 8, 9), station, true)`.
- Reduced motion: no transitions.

## 6. Assets and the pipeline (`art/`)

`art/` is a new top-level folder in the frontend lane. Add it to the PRD §6.2 layout in the PR description.

```
art/
  README.md            how to rebuild, tool versions
  SOURCES.md           every source asset: pack · version · licence · origin (already written)
  fetch-sources.sh     recreates art/src/ from pinned sources
  src/<pack>/          the CC0 packs, gitignored (already in place in the project folder)
  blender/*.py         headless build scripts (source of truth)
  out/atlas.png        1024×1536 atlas: the five pack colormaps plus a swatch slot (built by art:compose)
  out/                 raw exports (gitignored)
public/models/stations.glb   13 named meshes: one per officeType + milestone
public/models/city.glb       building meshes named by kind and variant
public/models/props.glb      trees, palms, boats, lamps, rail cars
public/thumbs/<officeType>.webp   512×384 renders for the drawer header (FE-4)
```

**Sources**: already downloaded into `art/src/` and recorded in `art/SOURCES.md`. All are CC0 Kenney packs: City Kit Commercial, Suburban, Industrial and Roads; Car Kit; Nature Kit (six palms, trees, bushes); three boats.
- Each city or car pack has its own 512² colormap. `art:compose` packs them into one 1024 × 1536 atlas: five colormap slots plus one slot of flat-colour swatches for the nature kit, the boats and the heroes. It remaps UVs so everything in the scene shares **one** material.
- Don't download anything else without asking. A local train model (P2) isn't included yet.
- Not allowed: CC-BY, NC or ND licences, Sketchfab downloads, ripped game assets, logos or emblems.

**Heroes**
- Modelled by script in Blender (`art/blender/heroes.py`) in the kit's style, from primitives, bevels and arrays.
- Limits: ≤ 6k triangles each; faces UV-mapped onto the swatch slot of the atlas, so heroes and kit share one material.

| officeType | Look |
|---|---|
| `municipal_hq` | heritage domed civic building: central dome, two wings, arcade of arches (silhouette only, no emblem) |
| `ward_office` | two-storey colonial office with a portico |
| `fire_services` | red station, three garage doors, hose tower |
| `health_department` | white clinic block with a teal band and a rooftop sign panel (no red cross) |
| `revenue_office` | stone building, columns, pediment |
| `labour_department` | three-storey brick office with a clock |
| `police` | office with blue trim and a roof light bar (no insignia) |
| `pollution_control_board` | office beside a chimney with a green ring |
| `utility_provider` | water tower and a substation box |
| `court_or_notary` | courthouse with a pediment and wide steps |
| `other` | modern generic office |
| `online_portal` | glass pavilion with a large glowing screen (emissive) |
| milestone | interchange plaza ring (frontend-spec) |

**Baked AO**
- Cycles bake of ambient occlusion into vertex colour `COLOR_0` (32 samples) for heroes and kit pieces.
- Materials use `vertexColors`.

**Build**
- `npm run art:build`: runs `$BLENDER_BIN -b -P art/blender/build_all.py`, with a fixed seed, and exports GLBs to `art/out/`.
- `npm run art:optimize`: runs `gltf-transform` (dedup, prune, weld, meshopt compression, textures resized to ≤ 1024 and converted to WebP) and writes into `public/models/`.
- Outputs are committed.

**Blender MCP**
- `ahujasid/blender-mcp`, in the workspace `.agents/mcp_config.json` (gitignored), with `DISABLE_TELEMETRY=true`.
- Use it for interactive iteration and viewport screenshots. The committed scripts are the source of truth.
- Its Hyper3D, Hunyuan3D and Sketchfab integrations stay off. AI-generated meshes need a separate decision.

**Runtime**
- `useGLTF(url, false, true)`: no Draco, and meshopt through three's bundled decoder.
- Preload the three GLBs. Extract geometries once into a module cache and dispose them on unmount.
- If a GLB fails to load, fall back to the procedural archetypes in `stationGeometries.ts` and a plain board.
- No runtime request leaves localhost or the deployed origin.

## 7. Budgets

These are measured on the stress graph at 1440 × 900 and reported verbatim.

| Metric | Budget | Hard limit |
|---|---|---|
| Scene draws (debug overlay definition) | ≤ 36 | 50 |
| Triangles rendered (`gl.info.render.triangles`, main pass) | ≤ 350k | 500k |
| fps, MacBook Air, dpr 2, Bloom on | 60 | 45 |
| `public/models` + `public/thumbs` total | ≤ 6 MB | 8 MB |
| One hero mesh | ≤ 6k triangles | |
| stations.glb | ≤ 1.5 MB | |
| city.glb + props.glb | ≤ 3 MB | |
| First 3D frame, production build on localhost | ≤ 2.5 s | |

Where the ≈ 30 scene draws come from:

| Item | Draw calls |
|---|---|
| hero archetypes | ≤ 13 |
| plaza rings | 1 |
| beacons | 1 |
| outline | 1 |
| route batches | 4 |
| pulses | 1 |
| board | 1 |
| water | 1 |
| roads + kerbs | 2 |
| city batch | 1 |
| props batch | 1 |
| train | 1 |

## 8. Where each part of the reference lands

| Reference element | Milestone |
|---|---|
| Light theme tokens, diorama, stations, routes, labels, stage headers, legend, restyled top bar and toggles | FE-1V |
| Same scene fed by contract v3 | FE-2 |
| Summary bar (Next up, estimated fee, total time, office visits), journey page, Share Journey | FE-3 |
| Right drawer: hero thumbnail, Overview/Documents/Fees/Source tabs, official source with verified date, Mark as complete; 2D view | FE-4 |
| Search "Start a restaurant in Mumbai" with a location chip | FE-5 |
| Left navigation: My Journey, Checklist, Documents, Office Visits, Resources | FE-6 |
| Office trip plan with a real map | FE-8 P2 (needs a map library and tile-provider decision) |
