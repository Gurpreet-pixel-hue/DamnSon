FE-1 · M2 · Civic Metro 3D (H0–H5) — prompt pack v1 text with review amendments (marked [A1]–[A5])
Branch: frontend. Read docs/frontend-spec.md (sections "3D scene", "Interaction", "Budget") and PRD §11.1 (v3 rendering and the view-model boundary), §11.3, §11.4.

Goal: the Civic Metro 3D scene, fed only by view models and running on today's v2 data. FE-2 swaps the data source later without touching components/canvas.
Out of scope: the 2D view, HUD panels, search, any backend or contract change.

First produce an implementation plan for phases 1–4 and wait for my approval.

Phase 1 · View models (lib/graph/viewModel.ts, pure TS)
  export type StationState = "done" | "available" | "locked";
  export type Applicability = "applies" | "may_apply" | "optional";
  export interface StationVM {
    id: string; title: string;
    kind: "government" | "non_government" | "milestone";
    officeType: OfficeType | null;                    // null for milestones
    mode: "online" | "in_person" | "hybrid" | null;   // null for milestones
    state: StationState; applicability: Applicability;
    layer: number; lane: number;
    position3D: [number, number, number]; position2D: { x: number; y: number };
    badge?: string;                                   // "×?" when a repeat count is unknown
  }
  export interface TrackVM { id: string; from: string; to: string; kind: "requires" | "recommended_after"; critical: boolean; toAvailable: boolean; dashed: boolean }
  export interface MetroVM { stations: StationVM[]; tracks: TrackVM[] }
- OfficeType: the 12-value union from the spec, defined locally for now (FE-2 imports it from lib/contract).
- Adapter fromV2(resolved: ResolvedPath, completed: ReadonlySet<string>): MetroVM, where resolved = resolvePath(graph, answers), built only from the existing M1 functions (deriveStepStates, computeMetroLayout, summarizeTime().criticalStepIds). Mapping: every step kind "government"; ids in resolved.undecidedStepIds → "may_apply"; optional requirement → "optional"; otherwise "applies"; track kind "requires"; critical when from and to are consecutive entries of criticalStepIds; dashed when either end is may_apply or optional; toAvailable when the target is available.
- Test: the v2 demo fixture maps to stations with unique positions and the same layers as computeMetroLayout.

Phase 2 · Geometry (components/canvas/stationGeometries.ts)
- One merged BufferGeometry per officeType archetype exactly as the spec lists (footprint ≤ 1.6 × 1.6, heights 1.0–2.6), built with BufferGeometryUtils.mergeGeometries.
- A 13th archetype for milestones: an interchange ring (TorusGeometry radius 0.8, tube 0.14, laid flat) on a disc (radius 0.8, height 0.12). v2 data has no milestones; FE-2 exercises it.
- Build once at module level; dispose on unmount.
- [A5] mergeGeometries needs matching attribute sets: convert every part with .toNonIndexed() (or all indexed) and keep only position + normal before merging. A unit test builds all 13 archetypes and asserts each bounding box fits the spec footprint (≤ 1.6 × 1.6) and height (≤ 2.6, milestone ≤ 0.3).

Phase 3 · Scene (components/canvas: SceneContainer.tsx, CameraRig.tsx, MetroScene.tsx, Ground.tsx, Stations.tsx, Tracks.tsx, Pulses.tsx, StationLabels.tsx, palette.ts, useSceneKeyboard.ts)
- [A1] Colours: add the frontend-spec colour tokens to app/globals.css as CSS variables (--cw-background #09090b, --cw-surface #18181b, --cw-border #27272a, --cw-text #fafafa, --cw-text-muted #a1a1aa, --cw-available #22d3ee, --cw-done #34d399, --cw-locked #52525b, --cw-undecided #fbbf24, --cw-error #f87171, --cw-critical #67e8f9) and define the same values once in components/canvas/palette.ts (three.js needs them in JS). Scene-only colours from the spec (ground #0c0c0f, station base and normal track #3f3f46) live only in palette.ts. A unit test reads app/globals.css and asserts every token in palette.ts equals its CSS variable. No raw hex anywhere else (PRD §11.6).
- Ground, grid and lights exactly as the spec's "Ground and lighting": plane #0c0c0f, drei <Grid> (cell #18181b, section #27272a, section size 7, fade distance 80), hemisphere light 0.35, one directional light at (20, 30, 10) with intensity 1.4 and a 1024² shadow map; only stations cast shadows.
- Stations: one InstancedMesh per archetype (≤ 13 draw calls). MeshStandardMaterial roughness 0.7, metalness 0.1, colour #3f3f46; state tint with setColorAt: done #34d399, available #22d3ee, locked #52525b, may_apply uses the spec's undecided #fbbf24. Status ring: one instanced RingGeometry(0.95, 1.1, 48), toneMapped={false}, same colours at 1.5× intensity so only rings bloom. Online kiosks get a thin dashed drop line to the ground (part of the track batch).
- Tracks: a cubic Bézier per TrackVM with control points at 40% and 60% of Δx, sampled at 24 points, batched into exactly three drei <Line segments> draw calls: normal (#3f3f46, width 3), critical (#67e8f9, width 5, only while the critical-path toggle is on), dashed (#fbbf24, width 2) for dashed tracks. Cache curves per MetroVM; never rebuild them inside useFrame.
- Pulses: one instanced sphere mesh (r 0.12, ≤ 40 instances) moving along tracks whose target is available, at 0.35 of the track length per second, using a precomputed arc-length lookup table. No allocations in useFrame.
- Motion: load (scale-y 0 → 1, staggered 120 ms per layer, 500 ms easeOutCubic; tracks reveal 200 ms after their target station); replan (removed stations sink over 300 ms, then positions tween 600 ms); mark done (250 ms colour lerp plus one ring flash). prefers-reduced-motion: every transition is instant, no pulses, no camera tweens (PRD §11.3).
- Camera (drei CameraControls): initial fitToBox with padding 1.5, polar 55°, azimuth −35°; selecting a station → setLookAt(station + (6, 7, 8), station, true); distance 6–70; max polar 80°; a "Reset view" button.
- Labels: drei <Html> only for hovered, focused and next-up stations (≤ 6 at once): title, state chip, office icon. No occlude.
- Post-processing: one EffectComposer with Bloom (luminanceThreshold 0.9, intensity 0.8, mipmapBlur) and a subtle Vignette. drei PerformanceMonitor: on decline set dpr 1 and turn Bloom off. Canvas dpr={[1, 2]}.
- Interaction: pointer events on the instanced meshes (instanceId → station id), stopPropagation, pointer cursor on hover. Click selects (useTaskStore.selectStep, which opens the existing drawer). Keyboard (useSceneKeyboard): ←/→ previous/next layer, ↑/↓ within a layer, Enter selects, Space toggles done. Focus mirrored in useViewStore.focusedStepId.
- Critical path: add criticalPathOn and toggleCriticalPath to useViewStore (not persisted) and a toggle button next to the 3D/2D toggle.
- WebGL unavailable or context lost → useViewStore.viewMode = "2d" and a one-line notice. Development-only test hook: ?nowebgl=1 forces that path.

Phase 4 · Wire-up
- app/page.tsx (server) reads the v2 demo graph through the existing graphRepository (DATA_SOURCE=fixtures in development) and passes it to ExplorerShell; ExplorerShell renders MetroScene from fromV2(...). In development only, /?graph=stress loads data/fixtures/stress/stress-25.json through a small server-only helper under app/ (fs + civicTaskGraphSchema + analyzeGraph); production ignores the parameter. Keep fs out of lib/graph: it stays pure TypeScript.
- [A2] "Server-only helper" means a plain module imported only by the server page. Don't install the `server-only` package (PL-3 adds it) or any other dependency.
- [A3] When the repository returns no graph (production, or any run without DATA_SOURCE=fixtures), render the shell with an empty state ("No published journeys yet"), never a crash. `npm run build` must stay green with DATA_SOURCE unset. Call useTaskStore.setActiveTask(taskId) when a graph loads, so Space / Mark done update that task's progress.
- [A4] Loading data/fixtures/demo in development through DATA_SOURCE=fixtures is allowed (PRD §13.6 DATA_SOURCE, AGENTS.md); it is not a conflict with the "fixtures are test-only" line in AGENTS.md, so don't stop to ask about it.
- Mark done goes through useTaskStore so states and pulses update.
- Development-only overlay behind ?debug=1 with three numbers, kept in refs and repainted at most twice a second:
  · scene draws: the visible meshes, instanced meshes and line batches in the scene (traverse it once a second). This is the spec's budget: 13 archetypes + rings + 3 track batches + pulses + ground + grid ≈ 20;
  · frame calls: every pass, including the shadow map and post-processing. Set gl.info.autoReset = false; in a useFrame with priority -1, read gl.info.render.calls as the previous frame's total, then call gl.info.reset(). With autoReset on, the composer's last pass hides everything else;
  · fps.

Verify
1. npm run verify green; test counts per file.
2. Dev server with DATA_SOURCE=fixtures: screenshots of the default view, a selected station and the stress graph.
3. Stress graph numbers from the debug overlay: scene draws ≤ 30 (the spec budget; 50 is the hard limit), plus the frame calls and fps you saw. Report all three.
4. Keyboard walkthrough and reduced motion (DevTools emulation): describe what happened.
5. ?nowebgl=1 switches to 2D with the notice.
6. Console clean apart from the THREE.Clock warning.
7. [A3] `npm run build` without DATA_SOURCE, then `npm start`: / shows the empty state (screenshot).

Commit in small steps (for example `feat(canvas): station archetypes (§11, frontend-spec)`), then push.
Report: verify tail, screenshots, draw calls and fps, every deviation from this prompt, follow-ups.
