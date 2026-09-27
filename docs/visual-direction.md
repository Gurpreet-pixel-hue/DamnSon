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
- Which labels show: **superseded by §10.6** (key steps by default, "All" on request). The rules below apply in "All" mode.
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
| App shell with framed 3D window (§9.1), summary bar (Next up, estimated fee, total time, office visits), journey page, Share Journey | FE-3 |
| Right drawer: hero thumbnail, Overview/Documents/Fees/Source tabs, official source with verified date, Mark as complete; 2D view | FE-4 |
| Landing with natural-language search, location chip, fact card and questions (§9.3, P0); intro sequence (§9.2, P1); landing → journey transition (§9.4, P1) | FE-5 |
| Left navigation: My Journey, Checklist, Documents, Office Visits, Resources | FE-6 |
| Street grid, traffic, pedestrians, station composites with sign plates, online kiosks, mark done with unlock, calm labels (§10) | FE-3.5 |
| Office trip plan with a real map | FE-8 P2 (needs a map library and tile-provider decision) |

---

## 9. App shell, intro and transitions (PRD 1.2, D20–D21)

Status: normative. This section supersedes the placement rules in `frontend-spec.md` "HUD": the full-screen canvas, the floating top bar and the floating summary bar. The tile contents stay as specified there. Priorities:
- the shell is P0 (FE-3);
- the intro and the transition are P1 (FE-5), built after the P0 path works, and cut first (PRD §15.5 item 2).

### 9.1 Journey page shell (FE-3)

Target width 1280–1920 px. From 1024 to 1279 px the rail collapses to icons and the drawer overlays the window. Below 1024 px the page shows the 2D view (PRD §11.3).

The shell is a CSS grid with 16 px page gutters and 16 px gaps:

```
┌ top bar 72 px ───────────────────────────────────────────────────────────────┐
│ brand │ journey chip · location chip │ Next up │ Fee │ Time │ Visits │ Share │
├ rail ──┬ 3D window (card) ──────────────────────────────┬ drawer 380 px ──────┤
│ 200 px │ stage-header band 56 px (inside the card)      │ docked; opens when  │
│ (64 px │ canvas                                         │ a step is selected  │
│ icons  │ footer 52 px: legend · 3D/2D · critical path · │                     │
│ <1440) │ fullscreen                                     │                     │
├────────┴────────────────────────────────────────────────┴─────────────────────┤
│ below the window: 2D panel (FE-4) · office trip plan (P2, FE-8)               │
└───────────────────────────────────────────────────────────────────────────────┘
```

**3D window**
- Height: `calc(100dvh - 72px - 48px)` (three 16 px gaps), at least 560 px. At 1440×900 the whole window is above the fold.
- Card style: `--cw-surface` border, radius 16, 1 px `--cw-border`, soft shadow, `overflow: hidden`.
- The canvas fills the card, and the scene clear colour is `--cw-background`.
- Safe-area insets are relative to the card: top 56 (stage headers), bottom 52 (footer), left and right 16. `computeSafeFit` takes the card's size, not the window's.
- The legend, the 3D/2D and critical-path toggles, and a fullscreen button live in the card footer, not as floating HUD.
- The debug overlay sits inside the card, bottom-left, above the footer.
- Fullscreen expands the card to the viewport (Fullscreen API on the card element). Esc returns.

**Top bar**
- **Brand:** an original mark (three woven metro lines in `--cw-brand`, `--cw-available` and `--cw-done`; no emblems, seals or crosses), "CivicWeave", and the tagline "Your city. In order.".
- **Journey chip:** the task title and a pencil icon. In FE-3 the pencil links to `/`. From FE-5 it returns to the landing with the query prefilled.
- **Location chip:** the template's jurisdiction (city, state) from data. Never inferred.
- **Summary tiles:** Next up · Estimated fee · Total time · Office visits, with the copy rules from the FE-3 prompt. Progress is a 3 px bar under the journey chip ("4 of 11 done" on hover and for screen readers).
- **Share Journey:** a primary button in `--cw-brand`.

**Left rail (content in FE-6)**
- Items: Home, My Journey, Checklist, Documents, Office Visits, Resources.
- FE-3 renders only Home and My Journey. Items without a page are not shown; there are no disabled placeholders.

**Right drawer (content in FE-4)**
- A docked grid column, not an overlay.
- Opening it narrows the window over 240 ms, with no animation under reduced motion. The camera refits to the new card size; the canvas never scales.
- Escape closes it. Clicking a station swaps its content.

### 9.2 Intro sequence (FE-5, P1)

**Purpose.** A brand moment that also hides load time. While it plays, it:
- imports the 3D chunk;
- preloads `stations.glb`, `city.glb` and `props.glb` with `useGLTF.preload`;
- does no GPU work. Shader warm-up happens on the journey page with `gl.compileAsync(scene, camera)` before the first visible frame.

**Rules**
- **Where:** `/`, on the first visit per browser session. Read the `cw-intro-seen` key in sessionStorage inside try/catch; if storage fails, play it. Deep links to `/journey/…` never show the intro.
- **Length:** 3.5–4.5 s, cut to a 120 BPM grid (beat = 0.5 s).
- **Skip:** always possible. A "Skip intro" button is visible from the first frame, and any key, click or tap also skips.
- **Medium:** DOM + SVG only, no WebGL while it plays. GSAP 3.15.0 timeline with SplitText, ScrambleTextPlugin, DrawSVGPlugin and Flip. Everything is registered inside a client component that loads with `next/dynamic` on `/` only.
- **Type:** Geist Sans 800, `clamp(72px, 14vw, 220px)`, tracking −0.04em. Colours are tokens only: `--cw-text` on `--cw-background`, with accents in `--cw-brand` and `--cw-available`.

**Storyboard (b = beat)**
1. **b0–b1.** Cream screen. One transit line (6 px, `--cw-available`) draws left to right (DrawSVG, `power2.inOut`), and three station dots pop on it (scale 0 → 1, `back.out(3)`).
2. **b1–b5.** Four words hit, one per beat, centred: "FORMS." "FEES." "OFFICES." "QUEUES.".
   - **In:** SplitText chars move from `yPercent: 110, rotationX: -80` to rest, with a 0.02 s stagger, `expo.out`, 0.35 s. The line jolts 8 px on each hit.
   - **Hit accent:** a 2-frame RGB split (text-shadow −4 px `--cw-brand` / +4 px `--cw-available`).
   - **Out:** `skewX: 12`, `filter: blur(8px)`, opacity 0, 0.15 s.
3. **b5–b6.** "The maze": the line scribbles into a tangle (DrawSVG on a precomputed tangled path, 0.5 s) while the last word shatters. Its chars scatter outward with random rotation and fade.
4. **b6–b7.** ScrambleText resolves to "IN ORDER." in `--cw-text`, and the tangle straightens into one clean line: crossfade the two paths while DrawSVG retracts the tangle.
5. **b7–b9.** The wordmark "CivicWeave" rises (chars, 0.03 s stagger) and the tagline "Your city. In order." fades up. The straight line Flips into the underline of the landing's search field, and the landing fades in around it. Focus moves to the input.

**Content rule.** Use generic civic nouns only: no department names, fees, dates, places or logos.

**Safety**
- No full-screen flashes.
- Nothing flashes more than 3 times per second (WCAG 2.3.1).
- No audio.

**Reduced motion.** No timeline. Show the wordmark and tagline statically for 600 ms with a 200 ms fade, then the landing.

**Accessibility.** Every animated layer is `aria-hidden`. Add one `sr-only` h1: "CivicWeave: your city, in order". The skip button is a real `<button>`.

**Slow load.** If the preload is still running at b9, hold on the wordmark with a determinate 2 px progress line showing the loaded bytes of the three GLBs, for at most 3 s. Then continue anyway; the journey page still has its own skeleton.

### 9.3 Landing (FE-5: search is P0, extras are P1)

**Layout**
- The wordmark sits small at the top left.
- One centred prompt, "What do you need to get done?" (Geist 600, 44 px).
- A large natural-language input: min height 64 px, radius 16, brand focus ring.
- A location chip, filled from the search result's jurisdiction. It is editable and never assumed.
- The primary button "Map my route".

**Examples.** The examples under the input are the titles of published templates (`listTemplates`). They are never invented.

**After submit** (`POST /api/v1/search`):
- The input docks to the top of the column.
- The fact card appears, with the words each fact came from highlighted.
- The decisive questions follow inline; this is the same component as on the journey page (FE-4).
- When AI is unavailable, show the lexical-fallback notice (PRD §6.6).

**Below the fold:** published journeys and the continue card (P1).

### 9.4 Landing → journey transition (FE-5, P1)

Total ≤ 2.4 s. Any input (pointer, key, wheel) cancels what is left and jumps to the final pose.

1. **0–0.4 s, DOM on the landing.** The fact card and questions fold up (`power3.in`), and the query text Flips toward the top-left, where the journey chip will appear.
2. **Navigation.** Navigate to `/journey/<taskId>?task=…&f=…&done=` (the share format in PRD §8.8). A module-level flag `arrivedFromLanding` (in memory, never persisted) enables the entrance. The shell renders at once.
3. **0.4–2.4 s, 3D entrance** in `components/canvas/entrance/`, driven from `useFrame` with refs only. No GSAP inside the canvas; use hand-written easing functions.
   - **Camera:** starts at polar 12°, azimuth −40°, 2.6 × the fit distance. It transitions to the safe-fit pose over 1.6 s with camera-controls (`smoothTime` 0.35).
   - **City rises:** each BatchedMesh instance scales in y from 0.01 to 1. Its delay is proportional to its distance from the first station (max 0.9 s), and each instance takes 0.35 s with `back.out`. Stop writing matrices once the last one settles.
   - **Stations and plazas:** each station pops after its block (scale 0.6 → 1, 0.25 s), and plazas fade in.
   - **Routes:** tracks draw in topological order through a dash-offset uniform (0.8 s total). Pulses start afterwards.
   - **Labels:** label cards and stage headers fade in last, staggered 0.2 s by layer.
4. **When it runs:** once per navigation from the landing. Reloads, deep links, `?debug=1` and reduced motion skip it and render the final pose.
5. **Budget:** no new draw calls, no allocations in `useFrame`, and scene draws stay within §7.

### 9.5 Files and assets for 9.2–9.4

- `components/intro/IntroSequence.tsx` and `components/intro/paths.ts`: SVG paths authored in code, with no downloaded artwork.
- `components/landing/*`.
- `components/canvas/entrance/useEntrance.ts`.
- Fonts come from the existing `geist` package through `next/font`. No font CDN.
- Use `motion` 13.4.4 for UI micro-interactions (drawer, toasts). Use `gsap` 3.15.0 only in `components/intro` and `components/landing`.

---

## 10. City life, station identity and progress (FE-3.5, decided 2026-09-27)

Status: normative. Decided by Gurpreet after reviewing FE-3. Where §3 or §4 disagree, this section wins.
- §4 "Which labels show" is replaced by §10.6.
- §3 "City fill" gains the street grid in §10.2.
- It adds no new dependencies and no downloaded assets. Everything comes from the Kenney packs already in `art/src/` or from procedural geometry.

### 10.1 Everything stands on the ground
- `art:compose` measures every city, props and stations mesh and bakes an offset, so each mesh's bounding-box `min.y` is 0.
- `planCity` places everything at the land top (y = 0.17).
- **Scale is always uniform.** The ≤ 0.7× height cap near stations (§3) is met by choosing a lower variant, never by squashing y.
- Test (`assets.test.ts`): every mesh has `min.y` within ±0.01, and every placed instance has `scale.x === scale.y === scale.z`.

### 10.2 Streets that read as a city
- **Grid.** The city is a real street grid: blocks of 3 × 3 cells, separated by 1-cell roads. Station plazas and route corridors snap to the grid, and every station plaza touches a road.
- **Road tiles** come from `kenney-city-kit-roads`, chosen from each cell's road neighbours:
  - `road-straight`, `road-bend`, `road-intersection`, `road-crossroad`, `road-end`;
  - `road-side` / `tile-low` for pavements.
  - All roads share the atlas `roads` slot and render as one `BatchedMesh` (+1 draw).
- **Journey routes run on the streets.** A route is a coloured lane painted on the road surface: a 0.35-wide ribbon at y = 0.19, colour from state (§3, "Routes"). It is no longer a floating line over the sand. Pulses travel along that lane.
- **Street furniture**, all in the props `BatchedMesh`:
  - `light-square` every third road cell;
  - `traffic-light` at intersections within 2 cells of a station;
  - bus-stop-style benches, reused from the existing props.
- **Buildings face the street.** Their rotation points the front at the nearest road cell.
- Far field, more than 8 cells from any station: low-detail buildings and trees only.

### 10.3 Moving cars
- Cars use the car kit: `sedan`, `taxi`, `van`, `suv`, `hatchback-sports`, `delivery`, `truck`, `garbage-truck`.
- 24–36 cars in one `BatchedMesh` (+1 draw). Budget: ≤ 25k triangles for all cars.
- **Driving:**
  - Cars drive loops through the road graph at 1.2–2.0 units/s.
  - **Keep left** (India).
  - Cars pause 0.4–1.2 s at intersections, and never overlap: a car keeps a minimum gap to the car ahead in its lane.
  - Matrices update in `useFrame` without allocations.
- **Parked service vehicles** (static): a `firetruck` at `fire_services` stations, `police` at `police`, `ambulance` at `health_department`.
- **When animation stops:**
  - Under reduced motion: cars are parked along kerbs and don't move.
  - Hidden tab (`document.hidden`): animation pauses.
  - PerformanceMonitor decline: cars stop first.

### 10.4 Pedestrians
- **Figures:** procedural low-poly people, ≤ 60 triangles each (a box body and an octahedron head), in 6 clothing colours from the palette, all in one `InstancedMesh` (+1 draw).
- **Walkers:** 60–100 walk along pavements at 0.4–0.7 units/s.
- **Queues:** 3–5 people stand in a short line at the door of each **in-person or hybrid** station, with a small idle sway. The number is decorative and fixed: it never implies a waiting time, and no text refers to it.
- **Under reduced motion:** the walkers are hidden and the queues stay, static.

### 10.5 Stations that say what they are, and how you do the step

**Hero composites**
- Each `officeType` gets a recognisable composite, built in `art/compose.mjs` from kit parts, procedural geometry and a sign plate. There is no Blender step in FE-3.5; Blender stays optional for Stage 2.
- Footprint ≤ 2.6 × 2.6, height 1.6–4.2, ≤ 6k triangles each, one atlas material.

| officeType | Composite | Sign plate |
|---|---|---|
| `municipal_hq` | heritage block, 4 columns on steps, drum and dome (procedural) | CIVIC CENTRE |
| `ward_office` | two-storey civic block with a small clock tower | WARD OFFICE |
| `revenue_office` | colonnaded front with a pediment | REVENUE OFFICE |
| `labour_department` | office block with a wide awning | LABOUR OFFICE |
| `fire_services` | red-accent station, 2 garage doors, drill tower, parked firetruck | FIRE STATION |
| `police` | blue-accent building, parked police car | POLICE STATION |
| `health_department` | white clinic with an ambulance bay | HEALTH OFFICE |
| `utility_provider` | water tower, substation box and pipes beside a small office | UTILITY OFFICE |
| `pollution_control_board` | office, chimney, green roof garden | ENVIRONMENT BOARD |
| `court_or_notary` | pediment, columns and wide steps | COURT · NOTARY |
| `other` | plain office block | OFFICE |
| `online_portal` | see "Online kiosk" below | none |

**Sign plates**
- Generic English words rendered by `art:compose` (sharp, SVG → PNG) into the atlas swatch slot, dark text on a cream plate.
- No emblems, seals, logos, crosses or real organisation names ("BMC", "MCGM" etc. are not allowed).
- A `non_government` step (e.g. the bank account) keeps its office composite. It shows the "non-government" badge (PRD §11.1) on its label, never a bank's name.

**Mode is visible** (from `step.mode`, never inferred):
- **`online` → Online kiosk.** There is no building:
  - a floating screen slab (1.6 × 1.0 × 0.12) at y = 2.2, with an emissive screen quad showing a monitor-and-cursor glyph from the atlas;
  - a thin light beam to a small round plaza;
  - a slow bob of ±0.08 over 3 s, turned off under reduced motion.
  - Label mode text: "Online · from home", with a monitor icon.
- **`in_person` → office building with a queue at the door.** Label: "In person · visit the office", with a building icon.
- **`hybrid` → the building plus a small floating screen above its roof.** Label: "Online + office visit".
- The legend gains three mode entries: Online · In person · Both.

### 10.6 Labels: calm by default, stable while moving

> **Superseded in part by §11 (2026-09-28).** "What shows by default" and the "Key steps / All" toggle are replaced by stage focus (§11.2). The hover, hysteresis, picking, same-frame projection and pixel-snapping rules below still apply.

**What shows by default ("Key steps")**
- **Full cards** only for next-up (available) stations, plus the selected, hovered and focused station.
- **Every other station gets a 28 px state pin** (the icon circle from §4, with no text), placed at the tether top. Hover or focus shows its full card as a tooltip.
- **Done stations** get a green pin with a check.
- A footer toggle "Labels: Key steps / All" switches this; the default is Key steps.
- "All" uses the §4 placement rules with the H3 slots.

**Stability**
- Label placement runs only when the camera has been still for 250 ms, and when the layout or state changes.
- While the camera moves, labels keep their slot offsets and only translate with their anchors.
- A label keeps its previous slot unless that slot now collides (hysteresis).
- The first fit is computed before the canvas becomes visible: there is no visible camera jump on load. Labels fade in over 200 ms, staggered by layer, after the first fit.

**Tests (`selectLabels.test.ts`)**
- The same input twice gives identical slots.
- A 2 % camera move changes the slot of at most 10 % of labels.
- The default mode shows full cards only for next-up, selected, hovered and focused stations.

**Hover never moves other labels** (added after Gurpreet saw hover jitter in FE-3)

Cause, found in `LabelLayer.tsx:151`: `selectLabels()` is memoised on `hoveredStepId`, so every hover re-runs placement for all labels. Also, a card that appears under the cursor blocks the canvas hover, so hover flips on and off in a loop.

- **Placement inputs.** Placement (`selectLabels`) depends only on metro, layout, state, the label mode (Key steps / All) and the settled camera. `hoveredStepId` and `focusedStepId` are removed from its inputs.
- **The hovered or focused station expands in place.** Its pin or card grows into a full card at its current slot, above everything else (`z-index` top). It may overlap neighbours, and no other label moves.
- **One hover state for canvas and DOM.** `pointerenter` on a label or pin sets `hoveredStepId`, exactly like the canvas raycast. Leaving both the station and its label clears it.
- **Hysteresis:** 60 ms enter delay and 200 ms leave delay, so that sweeping across stations does not flash cards.
- **Pointer events:** pins and cards take pointer events, and the tether line does not (`pointer-events: none`).
- **Picking:** a station's hover target is its building plus plaza. Overlapping hits resolve to the nearest station centre. Nothing else in the city is hoverable.
- **Same-frame projection.** The projector runs after the camera-controls update in the same frame, so labels don't trail the camera by one frame while damping.
  - Order the controls update before the projector with negative `useFrame` priorities, or project on the controls' `update` event.
  - Never use a positive priority: that takes over R3F's render loop.
- **Pixel snapping:** screen positions are rounded to whole pixels before `translate3d`.
- **Tests:**
  - `selectLabels.test.ts`: the same inputs with a different `hoveredStepId` give identical slots, because hover is not an input.
  - Playwright capture: move the pointer across 3 stations in 1 s and record the rects of all non-hovered labels. Their maximum displacement must be 0 px while the camera is still.

### 10.7 Mark done, and the path reacts (P0, pulled forward from FE-4)
**Drawer controls**
- The drawer has a primary "Mark as complete" button for action steps when `canMarkDone` is true.
- When a step is locked, the button is disabled, and the drawer lists the unfinished prerequisites ("Finish these first: …").
- Done steps show "Mark as not done".
- Milestones have no button; they complete automatically (PRD §8.8).

**Keyboard.** Space on the focused station toggles done (`frontend-spec.md`).

**What happens on done** (all derived from `deriveStepStates`, state kept in `completedByTask`):
- the station ring, pin and card turn done-green;
- its outgoing routes turn green;
- stations that become available play a 0.6 s "unlock" pop (scale 1 → 1.12 → 1) and turn blue;
- pulses re-route to the new next-up set;
- summary tiles and the progress bar update;
- an undo toast shows for 8 s: "Marked '<title>' done · Undo".
- Under reduced motion: no pop and no pulse, colours only.

**Other rules**
- Undo and "Mark as not done" restore the previous state exactly.
- The share link carries done ids (§8.8).

### 10.8 Budgets after §10 (these tighten §7)
| Metric | Budget |
|---|---|
| Scene draws | ≤ 36 (roads +1, cars +1, pedestrians +1, kiosk screens +1 are included) |
| Scene triangles (demo and stress) | ≤ 350k, target 300k |
| Frame triangles | ≤ 650k |
| fps on a MacBook Air-class laptop | 60, with cars and people moving |
| `public/models` + `public/thumbs` | ≤ 6 MB |

## 11. Stage focus: one stage at a time (decided 2026-09-28)

Status: normative. Decided by Gurpreet after reviewing FE-3.5 (PR #27). Where §4, §9.1 or §10 disagree, this section wins. It matches PRD §8.8, which already limits labels to "hovered/focused/next-up stations".

**Why.** The first view of PR #27 shows 7 cards, stage chips, every beacon, traffic and a patchy, flickering grid, all at once. A citizen should see one thing first: what to do now. Everything else stays one click away.

### 11.1 The model
- **A stage is one layer of the journey**, the same columns the stage chips already name ("1 · START HERE", "2 · THEN", "4 · IN PARALLEL (5)").
- **`focusStage`** is view state in `useViewStore`. It is never stored in progress and never goes in the share link.
- **The current stage is derived.** `currentStage(metro)` is the lowest layer that still has an `available` step that `applies`. When every step is done, it is the last stage. This is a pure function in `lib/graph/stages.ts`, with tests.
- **On load**, `focusStage = currentStage(metro)`.

**How focus moves**
- **Stage stepper**, bottom centre of the 3D window: `‹  Stage 2 of 5 · Then  ›` above one dot per stage:
  - done: green with a check;
  - focused: accent, filled;
  - other: outline.
  - Controls: the buttons, the `[` and `]` keys, and clicking a dot.
- **Stage chips in the scene** are clickable and focus their stage.
- **Clicking any station** (3D, 2D, card, tooltip) opens its drawer and focuses its stage.
- **Mark as complete.** If the focused stage has no `available` step that applies left, focus auto-advances to `currentStage()` after 700 ms. Otherwise focus stays, and nothing else moves. Undo restores the previous `focusStage` too.
- **Browsing ahead or back** with the stepper is allowed. While `focusStage ≠ currentStage`, a "Back to current step" button shows next to the stepper.
- **Keyboard and 2D equivalents:**
  - `[` / `]` move between stages; Tab cycles the focused stage's cards.
  - The 2D view (FE-4) uses the same `focusStage`.

### 11.2 What shows
| Element | Focused stage | Every other stage |
|---|---|---|
| Station card (title and mode line) | Yes, for every station in the stage | Never |
| Pins | None | None (pins are removed) |
| Building and plaza | Full colour, beacon on | Instance colour 40 % toward `--cw-paper`, no beacon. Done stations keep a small green check disc on the plaza, as a 3D decal, not a DOM element |
| Stage chip | Accent fill, bold | Done: green check. Others: muted outline. All chips are always visible: they are the route overview |
| Routes | Incoming and outgoing routes at full width and colour, with pulses only on these | 50 % width, 35 % opacity, no pulses |
| Hover on any station | One tooltip in place ("title · Stage n"). 60 ms enter delay, 200 ms leave delay. Nothing else changes | Same |

**When a stage has many stations**
- More than 4 stations: cards are compact (title on one line, 180 px wide, no mode line).
- More than 8: cards only for the `available` ones, plus a "+N more" chip under the stage chip that lists the rest in the drawer.

The "Labels: Key steps / All" footer toggle is removed.

### 11.3 Camera
- **Framing.** On load, and on every `focusStage` change, the camera frames the focused stage: its stations, their cards, and the next stage's chip. It never frames the whole city.
  - Use `computeSafeFit` with the HUD and drawer insets.
  - Glide 600 ms with ease-in-out; jump instantly under reduced motion.
- **First paint.** The load-time fit is computed before the canvas is revealed, so the camera never jumps on load (§10.6).
- **Whole route.** A "Whole route" button next to fullscreen fits all stations. In this view cards are hidden and only the stage chips and the stepper show. Pressing it again, or changing the stage, returns to stage framing.
- **Drawer.** The drawer overlays the right side of the 3D window instead of resizing it (this amends §9.1): 380 px wide with a shadow. The canvas size never changes when the drawer opens or closes. The fit takes the drawer width as its right inset.
- **Clicking a card in the focused stage** opens the drawer and does not move the camera, unless the station would sit under the drawer. In that case the camera pans only enough to clear the drawer.

### 11.4 Cards that never jump
**Root causes found in PR #27 (48f1773)**
1. **CSS transitions fight the projector.** `LabelLayer.tsx` cards have `transition-all` and pins have `transition-transform`, while `LabelProjector` writes `style.transform` every frame. The browser animates every per-frame move over 150 ms, so labels lag, swim and stutter.
2. **Slots are keyed by index** (`label-slot-${idx}`). When a selection re-orders `activeStations`, a DOM button switches to another station and animates across the screen.
3. **Too much re-layout.** `resolveLabelCollisions` re-runs on every selection change and 250 ms after every camera change, so labels hop after each click and after each damping tail.
4. **Hover scale on the moving element.** `scale-105` sits on the positioned element and compounds with the moving transform.
5. **The canvas resizes.** Opening the drawer resizes the canvas (1172 → 795 px wide), which re-projects and re-lays out everything.

**Rules**
- **One wrapper per station.** Each card has one positioned wrapper with `key={station.id}`.
  - The projector writes only `transform: translate3d(x, y, 0)` to it.
  - The wrapper has no CSS transition on `transform`, `translate` or `scale`.
  - Hover lift, border, shadow and done tint go on an inner element. That element may transition only `opacity`, `box-shadow`, `border-color` and `background-color`.
- **Layout runs once per (focusStage, canvas size, camera arrived).**
  - It produces a fixed screen offset per card, relative to its anchor.
  - While the camera moves, offsets stay fixed and cards follow their anchors.
  - Nothing re-lays out on click, hover, mark done, drawer open/close or camera damping.
- **On a focus change:**
  1. old cards fade out (120 ms);
  2. the camera glides;
  3. layout runs once;
  4. new cards fade in (180 ms).
- **Layout algorithm** (`layoutStageCards.ts`, pure, deterministic, ≤ 8 cards):
  - sort the stage's stations by screen x;
  - put each card 56 px above its anchor;
  - on overlap with the previous card, try 56 px below, then push sideways by the overlap;
  - clamp to the safe insets;
  - draw a tether from the card edge to the anchor, with `pointer-events: none`.
- **A card marked done stays in place** with the done tint until the stage advances. The others never reflow.
- **Projection:**
  - it runs at `useFrame` priority −1, after the controls update;
  - positions are rounded to whole pixels;
  - it skips the DOM write when the value hasn't changed.
- **Hover.** Canvas hover and card hover share `hoveredStepId` (§10.6). Hovering a card never changes any other card.

### 11.5 A calm city
**Root causes found in PR #27 renders**
1. **Z-fighting (the flashing).**
   - Road tiles sit at y = 0.17 with their surface at local y ≈ 0, exactly on the land-slab top (0.17), which shows as shimmering stripes across the lower half at 1440×900.
   - The plaza pad top (0.21) and the ring (0.211) also fight.
   - The default camera near and far planes (0.1 and 2000) make both worse.
2. **Lavender roads.** Road tiles keep Kenney's lavender atlas colour.
3. **Patchy grid.** Isolated cells fall back to `tile-low` squares, so the grid reads as a patchy checkerboard.
4. **Routes cut through blocks.** They are still Bézier curves at y = 0.19. §10.2 asked for lanes on the road.

**Rules**
- **Heights.** Flat layers are at least 0.01 apart:

  | Layer | World y |
  |---|---|
  | Land top | 0.170 |
  | Road surface | 0.180 (instance y = 0.180 − the tile's surface y) |
  | Route lane | 0.195 |
  | Plaza pad top | 0.210 |
  | Rings and decals | 0.225 |
  | Pulses | 0.240 |

  - Every flat decal (roads, lanes, rings, check discs) also sets `polygonOffset: true` with factor and units of −1 per layer above land.
  - Test: `heights.test.ts` asserts these constants are sorted, and that each pair is at least 0.01 apart.
- **Camera.** `near = 1` and `far = 400`. Check that `computeSafeFit` distances stay inside.
- **Road colours** come from the palette: `PALETTE.road` for the road surface and the kerb token for pavements. Bake them in `art/compose.mjs` or override the batch material. No lavender.
- **Grid.**
  - Streets are continuous lines on every 4th row and column (3 × 3 blocks).
  - A road cell with no road neighbour is not placed, and there are no `tile-low` fallbacks.
  - `roadGraph.test.ts` asserts: no `tile-low`; every road cell has at least one road neighbour; the street lines are continuous.
- **Routes follow the streets** (`components/canvas/city/routeOnRoads.ts`):
  - Find the path with BFS on the road graph, from the road cell touching station A's plaza to the one touching station B's.
  - Build a polyline through the cell centres in the left lane (0.18 from the centre line), with corners rounded at r = 0.3.
  - Render it as a flat 0.35-wide ribbon at y = 0.195, replacing the Bézier. Pulses follow the same polyline.
  - Routes that share a cell are offset by 0.12 per route.
  - Test: every route vertex lies on a road cell.
- **Focus hierarchy.**
  - City instances more than 10 cells from any focused-stage station lerp their colour 35 % toward `--cw-paper`, using `setColorAt` on focus change only.
  - At most 10 cars. Pedestrian queues only at focused-stage offices.
  - Reduced motion: no cars or people move.

### 11.6 Budgets (enforced; these replace §10.8)
PR #27 measured a demo scene of 472,562 triangles and a frame of 751,566. Example-startup measured 355,085 and stress 439,717. Each breaks §10.8, and the report said "Deviations: None". Reports list every budget with its measured value; a miss is a deviation.

| Metric | Budget | Measured in |
|---|---|---|
| Scene triangles | ≤ 350k, target 300k | Whole-route view (the worst case) on demo, example-startup and stress |
| Frame triangles | ≤ 650k | Same |
| Scene draws | ≤ 36 | Same |
| fps | 60 on a MacBook Air-class laptop, with cars moving | Same |

Levers:
- far-LOD variants for buildings beyond the focus radius;
- lower-poly trees;
- simpler pavement bevels on road tiles;
- fewer and lower-poly cars.

### 11.7 Proof
- **Unit tests:**
  - `stages.test.ts`: a fresh journey is at stage 1; after marking every stage-1 step that applies done, the current stage is the next layer with work; when everything is done, it is the last stage.
  - `layoutStageCards.test.ts`: the same input gives the same output; only focused-stage stations get cards; changes to hover, selection or done state do not change any offset.
- **Playwright capture** (`art/tools/capture-stage-focus.mjs`, run on a real GPU at 1440×900):
  - **First view.** Cards visible = the number of stage-1 stations. There are no pins.
  - **Hover.** Move in and out of a card and of its station, 10 times each at 150 ms. Sample every card rect on every animation frame. Every wrapper's displacement must be 0 px.
  - **Click.** Click a card in the focused stage, then open and close the drawer. Every wrapper's displacement must be 0 px, and the canvas size must be unchanged.
  - **Mark done.** Mark a step done in a stage that still has other steps. Every other wrapper's displacement must be 0 px. Then mark the last step in the stage done: focus advances and the new stage's cards appear.
  - **Stepper.** Step through every stage and back.
  - **Flicker.** Under reduced motion, orbit the camera 0.5° per frame for 20 frames. Save road close-up crops at three zoom levels for review.
  - **Screenshots:** first view, each stage, whole route, road close-ups, mark done before and after, and the stepper.

### 11.8 Framing and placement fixes (review of PR #27 at ba31e1a, 2026-09-28)
**Found in the code and in Antigravity's own screenshots** (`first-view.png`, `stage-3.png`):
- **The camera sits about ten times too far away.** `CameraRig.tsx` passes pixel-sized padding (56, 52, 16, and 396 with the drawer open) to `camera-controls` `fitToBox`, which reads padding as world units. The stage becomes a speck on a fogged, washed-out board.
- **The camera angle is wrong.** `fitToBox` snaps the camera to the nearest 90° angle, and `rotateTo(-15°, 52°)` then runs after the fit without re-fitting, so the result is off-frame or low horizon views (stage 3).
  - Proof: with the angle set first and padding of about 1.5 world units, stage 1 of example-startup renders as a readable city view.
- **The stepper covers the stations it frames.**
- **Cards overlap** each other and the stage chips. At stage 4 of example-startup, "Apply for registration" covers "File an intimation", and cards sit far from their stations.
- **Stage chips collide** once more than about 6 stages are in view ("7 · Th…", "8 · In parallel", "11 · Then" stacked).
- **The road close-up evidence is invalid.** `road-closeup-zoom1/2/3.png` are the same image (323,326 bytes each).

**Framing rules** (these replace the `fitToBox` use in §11.3)
- **A pure `frameView()` function** in `components/canvas/camera/frameView.ts`.
  - Inputs: the target box (stage stations, plus 3.2 of height for cards, plus the next chip); azimuth −15° and polar 52°, both fixed; fov; canvas size in px; insets in px.
  - Insets: top 56; bottom = stepper height + 24; left 24; right 24, or 404 when the drawer is open.
  - It binary-searches the camera distance until every projected corner of the box lies inside the safe rect, then returns `{ position, target }`.
  - Distance is clamped to [14, 45] in stage view and [30, 110] in whole-route view.
- **The rig makes one call:** `controls.setLookAt(...position, ...target, transition)`. No `fitToBox`, and no `rotateTo` after it.
- **Fog** stays distance-scaled, but land within the framed box never fogs: fog near ≥ distance + box radius.
- **Tests** (`frameView.test.ts`):
  - All corners are inside the safe rect with at most 15 % slack on the tight axis.
  - A single-station stage frames at distance ≤ 30.
  - The drawer inset moves the target, not the angle.

**Placement rules**
- **Obstacles.** `layoutStageCards` treats the visible stage chips, the stepper rect and the drawer rect as obstacles.
- **No overlap.** Cards never overlap each other or an obstacle, measured on rendered rects.
- **Tethers stay short:** at most 140 px from a card's edge to its station anchor.
  - When a card can't fit, the stage uses compact cards.
  - If they still don't fit, "+N more" (§11.2).
- **Layout timing.** Layout runs only after the camera's `rest` event for that framing. It never runs on a pre-glide camera.
- **Stage chips:**
  - In stage view, show only the focused chip and the next stage's chip.
  - In whole-route view, show all chips with screen-space collision culling (priority: focused, then current, then others). The stepper dots remain the full list.
- **Empty blocks** (the large pale lots) become small parks: a grass tint plus 2–3 trees from the existing tree batch. Stay inside the §11.6 budgets.

**Evidence rules**
- **Look at every screenshot before reporting.** A screenshot that shows a defect listed here is a deviation, even if a metric passes.
- **Close-up images must differ.** The road close-ups are taken at three genuinely different camera distances (report the distance for each). Three identical files are a failed capture.
- **Capture numbers on example-startup stage 4 (5 stations):**
  - card–card overlap area (0 px² required);
  - card–obstacle overlap (0);
  - maximum tether length (≤ 140 px);
  - the focused station's anchor inside the safe rect (true).


## 12. Stage navigation and big parallel stages (decided 2026-09-28)

Status: normative. Decided by Gurpreet after using FE-3.5 on real data.
- On start-business-mumbai, stage 4 has **15 parallel stations** with no answers, or 10 with typical answers.
- The camera pulls back or pans to fit them, the in-world stage pills leave the screen, and there is no quick way to walk through the options.

Where §11 disagrees, this section wins.

### 12.1 Keyboard (one map for 3D and 2D; replaces frontend-spec "Keyboard" and §11.1 `[` / `]`)
| Key | Action |
|---|---|
| ← / → | Previous / next stage. Focus lands on the first station of that stage |
| ↑ / ↓ | Previous / next station within the focused stage, in tray order (§12.3). The camera glides to it, and its card shows. With the drawer open, the drawer follows |
| Enter | Open the drawer for the focused station |
| Space | Toggle done (same rules as the drawer button) |
| Esc | Close the drawer. Pressed again, it returns to the stage overview |
| Home / End | First / last stage |
| `C` | Back to the current stage |
| `[` / `]` | Kept as aliases for ← / → |

- Keys act only when focus is not in a text input, select or the drawer's scrollable text.
- Focus is mirrored in `useViewStore.focusedStepId`, so 3D, 2D and the tray stay in sync.
- A visually hidden live region announces "Stage 4 of 7, In parallel, 15 steps. Step 3 of 15: Apply for GST registration, available".
- A small "Keys" hint (? icon) in the window footer lists this table.

### 12.2 Stage bar (always visible; replaces the stepper dots and the in-world chip row)
- **Placement.** The bottom-centre stepper becomes a **stage bar**: one pill per stage (`1 Start here`, `2 Then`, `4 In parallel · 15`…). It is HUD (DOM), so it never leaves the screen when the camera moves.
- **Pill states:**
  - done: green with a check;
  - current: blue ring;
  - focused: accent fill;
  - future: outline.
- **Clicking a pill** focuses that stage.
- **Many stages.** With more than 7 stages, pills outside the focused ±2 collapse to numbers. The bar scrolls horizontally inside its own box, never the page.
- **In-world chips:**
  - Only the **focused** stage's chip remains in the 3D scene.
  - If its anchor projects outside the safe rect, it pins to the nearest window edge with a chevron pointing toward the stations, so it never disappears.
  - The "next stage" chip moves into the stage bar.
- **Existing controls keep working:** "Back to current step", Whole route, and the §11.3 bottom inset (now measured from the bar).

### 12.3 Parallel stage tray (stages with more than 4 stations)
**The tray**
- A 300 px panel **overlays the left edge of the 3D window**, like the drawer on the right. It never resizes the canvas (§11.4).
- Title: "Stage 4 · 15 things you can do in parallel".
- Filter chips: All / Available / Online / In person / May apply, each with a count.

**Rows**
- Rows are grouped by module (module title as the group header, e.g. "Professional Tax", "EPFO", "FSSAI"), in template order.
- Each row shows a state icon, the number `4.1`…`4.15`, the title, a mode chip, and the fee hint (honest-tile rules, §FE-4 fixes).

**Interaction**
- Hovering a row highlights its station in 3D.
- Clicking a row, or ↑ / ↓, selects it: the camera glides to frame **that station plus its plaza** (framing distance ≤ 24), and its card shows.
- The tray shows "3 of 15" with ‹ ›.

**Numbered markers in 3D**
- In a big stage, every station gets a **numbered disc marker** (a 3D decal on its plaza, instanced, 1 draw) matching the tray numbers, so the list and the map connect at a glance.
- Only the selected and hovered stations show full cards. Replace §11.2's "+N more" with the tray.

**Opening and closing**
- The tray opens automatically when the focused stage has more than 4 stations, and collapses to a tab ("15 steps ›") when the drawer is open.
- It closes with Esc or its × button.
- The 2D view uses the same tray and selection.

### 12.4 Route declutter (stage view)
- Show only the routes **into and out of the focused stage**, plus the path from the current stage to it.
- Hide all other routes in stage view; Whole route shows everything.
- In a big stage, fan-out routes from the previous milestone bundle into one trunk that splits near the stations (edge bundling by sharing the road path), instead of 15 separate dashed lines.

### 12.5 Later (P1, after 12.1–12.4)
- **Module districts.** Place a big stage's stations by module on adjacent blocks, with a soft ground tint and a small district label ("Labour registrations", "Food licence"). 15 parallel steps then read as about 6 groups.
- **Online hub.** Group online-only steps in one "Online services" plaza near the start, instead of scattering kiosks across the city. They have no physical location.
- **Minimap.** A 140×90 px SVG in the window corner, drawn from `position2D`, with a viewport rectangle and stage colours. Clicking it pans.
- **"You are here" marker.** A small citizen figure at the current stage's plaza, which walks along the route to the next stage on mark done. Disabled under reduced motion.

### 12.6 Model upgrades (FE-8 Stage 2 heroes; Blender, procedural, no downloads, ≤ 6k triangles each, palette colours, baked AO)
- **Distinct silhouettes per `officeType`:**
  - company registry: tower with portico;
  - tax office: glass-front block with a queue canopy;
  - labour office: two-storey block with a flag;
  - food safety: low block with a rooftop kitchen vent;
  - ward office: heritage-style block with a dome (generic, not a real building);
  - bank: columns plus a vault door;
  - post office: red-trim block.
- **Sign plates** use icon glyphs (building, rupee, plate, drop), not text.
- **Online portal:** replace the black billboard with a compact floating device (laptop or phone plus an orbiting ring, ≤ 800 triangles), tinted by state.
- **Milestones:** a gateway arch at the milestone plaza ("Company incorporated"), so stage boundaries read as passing through a gate.
- **People:** ≤ 150 triangles, with a 2-frame vertex-shader walk, instanced.
- **Budgets:** §11.6 still applies. Hero upgrades must stay within 350k scene triangles in whole-route view.
