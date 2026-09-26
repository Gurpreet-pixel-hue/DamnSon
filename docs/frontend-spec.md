# Frontend Spec — "Civic Metro"

v1, decided 2026-09-26. Target: laptops (≥ 1280 px wide). Below 1024 px wide the app forces the 2D view and shows a one-line "best on a laptop" note.

## Concept

A procedure is drawn as a metro line.

- **Stations** are steps; **tracks** are dependencies.
- **Left → right is time.** Each column is one `analyzeGraph` layer, so steps in the same column can be done in parallel.
- A station's **building** shows *where* the step happens (its `officeType`).
- **Online steps float** 2.2 units above the street; in-person and hybrid steps stand on the ground.
- The 2D view is the same map drawn flat, using the same layout, so switching views never reorders anything.

## The journey (what a user does)

1. **Search.** Type a task, e.g. "cloud kitchen Bandra". Autocomplete matches task titles and `keywords`. Picking a task loads its graph.
2. **"Does this apply to you?"** The graph's yes/no `questions` appear in a short dialog; skipping is allowed. Answers prune conditional steps, and the line animates into its personal shape.
   - Unanswered conditional steps stay on the map as **undecided**: a dashed amber outline, and counted separately in the totals.
   - Answers can be changed later from the left panel.
3. **Read the map.**
   - Stations rise column by column. A pulse runs along the tracks into every *available* station.
   - The summary bar says what to do next and what it will cost.
4. **Open a station** (click, or Enter on the keyboard) to see the step drawer: forms, a document checklist, fee, processing time, office, and official links with their verification state.
5. **Mark done.** The station turns emerald, the next stations unlock, and every total updates.
6. **Plan trips.** The office trip plan groups in-person steps by office, with a schematic mini-map and "Open in Google Maps" links.
7. **Share or print.** The URL carries the task, answers and progress. `/checklist` renders a printable version.

## Derived data (all computed in `lib/graph`, never stored)

| Function | Output |
|---|---|
| `resolvePath(graph, answers)` | Pruned graph: non-applicable conditional steps removed, their edges bridged (every prerequisite of a removed step becomes a prerequisite of each of its dependents, deduplicated). Also returns `excludedStepIds` and `undecidedStepIds` |
| `deriveStepStates(graph, completed)` | `done` / `available` (all prerequisites done) / `locked` |
| `summarizeFees(path, completed)` | Remaining `minINR` / `maxINR` / `unconfirmedCount` / `undecidedCount`. Undecided steps count toward max only. Optional steps are excluded |
| `summarizeTime(path, completed)` | Remaining `minDays` / `maxDays` / `unknownCount` / `criticalStepIds`, using the longest path. Working days × 7/5, rounded up per step. Undecided steps count toward max only |
| `planOfficeTrips(path)` | Non-online, non-optional steps grouped by office name (falling back to department), in topological order |
| `computeMetroLayout(path)` | Per step: `layer`, `lane`, `position3D`, `position2D`. Lanes are ordered by the barycenter of prerequisite lanes, ties broken by node order |
| `encodeShareState` / `decodeShareState` | `?task=…&a=qid.y,qid.n&done=id,id` (sorted, stable). Unknown ids are dropped on decode |

**Optional steps** are drawn on a thin side spur. They never block other steps (`analyzeGraph` rejects optional prerequisites) and are excluded from totals and the critical path.

## 3D scene (R3F)

**Coordinates:** x = layer × 7, z = lane offset × 4.5 (lanes centred on 0), y = 0 (ground) or 2.2 (online).

**Ground and lighting**
- Plane, colour `#0c0c0f`. drei `<Grid>`: cell `#18181b`, section `#27272a`, section size 7 (one column per section), fade distance 80.
- Hemisphere light 0.35. One directional light at (20, 30, 10), intensity 1.4, `castShadow` with a 1024² shadow map. Only stations cast shadows; the ground receives them.

**Stations**
- One merged `BufferGeometry` per `officeType` archetype (`BufferGeometryUtils.mergeGeometries`), drawn as one `InstancedMesh` per archetype. That is ≤ 12 draw calls whatever the graph size.
- Footprint ≤ 1.6 × 1.6, heights 1.0–2.6:
  - `municipal_hq`: stepped tower (1.6×0.8×1.6 + 1.2×0.9×1.2 + 0.8×0.9×0.8)
  - `ward_office`: 1.4×1.0×1.4 block + 4-segment pyramid roof 0.6 high
  - `fire_services`: 1.5×1.0×1.2 block + 0.4×1.2×0.4 hose tower at one corner
  - `health_department`: 1.4×1.1×1.4 block + a flat cross (two 0.9×0.08×0.25 bars) on the roof
  - `revenue_office`: 1.5×0.9×1.2 block + 4 columns (r 0.08, h 0.9) in front + 0.15 slab
  - `labour_department`: 1.4×1.2×1.2 block with a sawtooth roof (2 prisms)
  - `police`: 1.3×1.1×1.3 block + 0.5 cylinder beacon
  - `pollution_control_board`: 1.2×0.8×1.2 block + chimney cylinder r 0.15, h 1.4
  - `utility_provider`: 1.0×0.8×1.0 block + tank cylinder r 0.45, h 0.9
  - `court_or_notary`: 1.5×1.0×1.1 block + triangular pediment
  - `other`: 1.2×1.0×1.2 block
  - `online_portal`: floating hexagonal prism (r 0.7, h 0.35) with a thin rim ring
- Material: `MeshStandardMaterial`, roughness 0.7, metalness 0.1, colour `#3f3f46`. State tint via `setColorAt`:
  - done `#34d399`
  - available `#22d3ee`
  - locked `#52525b`
  - undecided `#fbbf24`
- **Status ring** under every station: one instanced `RingGeometry(0.95, 1.1, 48)`, `toneMapped={false}`, same state colours at 1.5× intensity so only rings bloom.
- **Online kiosks:** a thin vertical dashed line down to the ground, part of the batched track geometry.

**Tracks**
- For each edge: a cubic Bézier from station top-front to station top-back, with metro-style control points at 40% / 60% of Δx.
- Sampled at 24 points, all batched into **three** drei `<Line segments>` draw calls:
  1. normal: `#3f3f46`, width 3
  2. critical path: `#67e8f9`, width 5 (when the critical-path toggle is on)
  3. undecided / optional: dashed `#fbbf24`, width 2
- Curves are cached per resolved graph and never rebuilt inside `useFrame`.

**Pulses**
- One instanced sphere mesh (r 0.12, ≤ 40 instances).
- Moves along each track that ends at an *available* station at 0.35 of the track length per second.
- Uses a precomputed arc-length lookup table, with no allocations in `useFrame`.

**Motion**
- **Load:** stations scale-y from 0 → 1, staggered 120 ms per layer, 500 ms `easeOutCubic`. Tracks reveal 200 ms after their target station.
- **Replan** (answers change): removed stations sink over 300 ms, then the layout tweens 600 ms to new positions.
- **Mark done:** colour lerp over 250 ms, plus a single ring flash.
- `prefers-reduced-motion`: every transition is instant.

**Camera** (drei `<CameraControls>`)
- Initial: `fitToBox` over all stations with padding 1.5, polar 55°, azimuth −35°.
- Selecting a station: `setLookAt(station + (6, 7, 8), station, true)`.
- Limits: distance 6–70, max polar 80°.
- "Reset view" button.

**Labels**
- drei `<Html>` badges only for hovered / focused / next-up stations (≤ 6 at once): title, state chip, office icon.
- No `occlude`.

**Budget:** ≤ 30 draw calls for 25 steps (12 archetypes + rings + 3 track batches + pulses + ground + grid + postprocessing), 60 fps on a MacBook Air.

**Post-processing and fallback**
- `<EffectComposer>` with Bloom (luminanceThreshold 0.9, intensity 0.8, mipmapBlur) and a subtle Vignette.
- drei `<PerformanceMonitor>`: on decline, drop DPR to 1 and disable Bloom.
- WebGL unavailable or context lost → switch to 2D and show a one-line notice.

**Interaction**
- R3F pointer events on instanced meshes (`instanceId` → stepId), `stopPropagation`, pointer cursor on hover.
- Keyboard:
  - ←/→ moves focus to the previous/next layer, ↑/↓ within a layer.
  - Enter opens the drawer.
  - Space toggles done.
  - Focus is mirrored in `useViewStore.focusedStepId`, so both views stay in sync.

## 2D view (React Flow)

- Same `computeMetroLayout().position2D`; nodes are not draggable.
- Custom `StationNode`: 200×72 card with a lucide office icon, title, state chip, fee and a time hint. Online stations get a dashed border.
- Custom `TrackEdge`: smoothstep, same colours and dash rules as 3D; critical path at 3 px.
- Keyboard navigation and screen-reader labels ("Step 2 of 6, Site inspection, available, 1 prerequisite done").
- This view is the accessible and no-WebGL path, and must offer every action the 3D view offers.

## HUD (shadcn, dark, frosted panels `bg-zinc-950/70 backdrop-blur-md`)

**Top bar**
- Left: product name.
- Centre (max 640 px): search with autocomplete (task titles plus keywords, simple token scoring, ↑/↓/Enter, 8 results max) and a location chip ("Mumbai").
- Right: 3D/2D toggle, critical-path toggle, Share, Print.

**Summary bar** (under the top bar once a task is loaded), five tiles:
1. **Next up:** available steps; "do these in parallel" when there are 2 or more.
2. **Fees remaining:** "₹600–1,600 · 1 to confirm".
3. **Time remaining:** "7–15 days · 1 unknown".
4. **Office visits:** count; click to open the trip plan.
5. **Progress:** "1 of 4 done" plus a thin bar.

**Left panel ("Your situation")**
- The questions as yes/no segmented toggles. Unanswered ones show an amber dot; "Change answers" replans the map.

**Right drawer (Sheet, 420 px)** for the selected step:
- Title, state, department.
- Requirement: conditional text / optional note.
- Mode and office (address, hours, maps link).
- Forms (with links), documents (checkbox list, stored locally), fee, time.
- Official sources: domain, kind, "retrieved on"; an "official" badge from `isOfficialUrl`, or an amber "unofficial source" badge.
- Review state: verified date / unverified / flagged with its note.
- "Why is this locked?": the edge notes of unfinished prerequisites.
- A primary "Mark done" button.

**Trip plan panel** (bottom-left, collapsible)
- Ordered office list with the steps done at each office.
- A schematic SVG mini-map that scatters offices by lat/lng with no map tiles.
- An "Open in Google Maps" link per office.
- Offices without coordinates are listed as "location not verified".

**Empty, error and fallback states**
- No task yet: suggested workflows (from the repository), with a short "how it works" explainer.
- Task not found: suggestions.
- Every missing value renders "not verified", never a guess.

**Checklist page** `/checklist?task=…&a=…&done=…` (print CSS, light theme)
- Steps in topological order with checkboxes, documents, fees, offices and official URLs printed in full.

## Admin (M4)

- The same map, plus red and amber markers on stations with `analyzeGraph` errors and warnings.
- An issue list; editing a step revalidates the whole graph before save.

## Colour tokens

| Token | Hex |
|---|---|
| background | `#09090b` |
| surface | `#18181b` |
| border | `#27272a` |
| text | `#fafafa` |
| text muted | `#a1a1aa` |
| available | `#22d3ee` |
| done | `#34d399` |
| locked | `#52525b` |
| undecided / warning | `#fbbf24` |
| error | `#f87171` |
| critical path | `#67e8f9` |

## Delivery milestones

| | Milestone | Scope |
|---|---|---|
| M1 | Journey logic + data layer | Schema v2 (questions), `resolvePath` … `decodeShareState`, graph repository, demo/stress fixtures, tests. No UI |
| M1-data | Real seed graphs (parallel track) | 2–3 Mumbai procedures researched from official portals, with real questions, verified |
| M2 | Civic Metro 3D | Stations, tracks, pulses, motion, camera, labels, keyboard, perf budget, WebGL fallback |
| M3 | 2D view + HUD | Search, questions, summary bar, drawer, mark done, critical path, trip plan, share, checklist |
| M4 | Admin | Map with issue markers, issue list, whole-graph validation |
| M5 | Backend | Extraction pipeline, persistence, auth, search API |
| M6 | Demo polish | Performance pass, accessibility audit, demo script |
