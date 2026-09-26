> Superseded where it differs by docs/prd/CivicWeave-PRD.md (v1.1). docs/frontend-spec.md stays normative for Civic Metro parameters.

# Repository Structure

`[M0]` = created by the scaffold prompt. `[M1]`–`[M5]` = created in that milestone. Paths are relative to the repo root (there is no `src/`).

```text
DamnSon/
├── AGENTS.md                         [M0] Always-on agent rules (ends with the Next.js managed block)
├── README.md  .gitignore  .nvmrc     [M0]
├── .agents/
│   ├── rules/3d-canvas.md            [M0] Auto-loads when touching components/canvas/**
│   ├── rules/graph-contract.md       [M0] Auto-loads for lib/graph/**, data/**, app/api/**
│   └── workflows/verify.md           [M0] /verify → lint, typecheck, test, build
├── docs/
│   ├── ps.md  techstack.md  structure.md  frontend-spec.md
│   ├── graph-data-schema.json        [M0] Graph contract (JSON Schema 2020-12)
│   ├── examples/example-graph.json   [M0] Synthetic graph covering every variant
│   └── prompts/                      [M0] Prompts given to the implementation agent, one per milestone
├── app/
│   ├── layout.tsx                    [M0] Dark root layout, self-hosted Geist fonts, metadata
│   ├── globals.css                   [M0] Tailwind v4 + shadcn theme tokens (replaces tailwind.config.ts)
│   ├── page.tsx                      [M0] Explorer route → <ExplorerShell />
│   ├── admin/page.tsx                [M0] Admin: review and verify graphs (placeholder until M4)
│   ├── checklist/page.tsx            [M3] Printable checklist from share-state query params
│   └── api/
│       ├── search-path/route.ts      [M0] POST {query, location?}: zod-validated, 501 until M5
│       └── admin/graphs/[taskId]/route.ts  [M0] GET/PUT a whole graph: 501 until M5 (needs auth)
├── components/
│   ├── ui/                           [M0] shadcn primitives only (generated)
│   ├── explorer/ExplorerShell.tsx    [M0] Client boundary: HUD + 3D/2D switch (next/dynamic, ssr:false)
│   ├── canvas/                       3D (R3F), client-only
│   │   ├── SceneContainer.tsx        [M0] <Canvas>, lights, postprocessing, scene root
│   │   ├── CameraRig.tsx             [M0] CameraControls + focus transitions
│   │   └── MetroScene.tsx, Stations.tsx, stationGeometries.ts, Tracks.tsx, Pulses.tsx, StationLabels.tsx, useSceneKeyboard.ts   [M2]
│   ├── graph-2d/                     [M0] FlowchartView.tsx; [M3] StationNode.tsx, TrackEdge.tsx
│   ├── hud/                          [M0] SearchBar, ViewModeToggle, NodeDetailsDrawer, ProgressTracker
│   │                                 [M3] QuestionsPanel, SummaryBar, TripPlanPanel, MiniMap, ShareButton
│   └── admin/                        [M0] GraphEditorTable, NodeFormModal (placeholders until M4)
├── lib/
│   ├── graph/
│   │   ├── schema.ts                 [M0] zod mirror of docs/graph-data-schema.json + inferred types
│   │   ├── analyzeGraph.ts           [M0] Integrity checks, topological order, parallel layers
│   │   ├── officialSources.ts        [M0] isOfficialUrl(): gov.in / nic.in + vetted exceptions
│   │   ├── graph.test.ts             [M0] Conformance (Ajv ⇄ zod) + algorithm tests
│   │   └── resolvePath.ts, progress.ts, totals.ts, trips.ts, layout.ts, shareState.ts   [M1] Derived journey data
│   ├── store/
│   │   ├── useTaskStore.ts           [M0] Active task, selected step, completion (persisted)
│   │   └── useViewStore.ts           [M0] 3D/2D mode, focused/hovered step (ephemeral)
│   ├── data/graphRepository.ts       [M1] Load + validate graphs (seed files; fixtures only via DATA_SOURCE in dev; database in M5)
│   └── utils.ts                      [M0] cn() from shadcn
├── data/
│   ├── README.md                     [M0] What may go in fixtures vs seed
│   ├── fixtures/                     [M0] valid/, invalid-schema/, invalid-graph/; [M1] demo/, stress/ (synthetic)
│   └── seed/                         [M1] Real, verified graphs only
├── public/models/                    [M2, optional] glTF only if procedural geometry isn't enough
├── components.json  eslint.config.mjs  next.config.ts  postcss.config.mjs
└── tsconfig.json  vitest.config.mts  package.json
```

## Changes from v1

- `tailwind.config.ts` removed (Tailwind v4 is configured in CSS).
- HUD moved out of `components/ui`, which is shadcn's generated folder.
- `useCameraStore` replaced by `useViewStore`. Camera coordinates change every frame and must not live in React state.
- `mockCivicData.ts` replaced by validated JSON in `data/` (fixtures for tests, seed for real data), so there is no mock data in production code paths.
- `api/admin/update-node` replaced by a whole-graph `PUT`. Editing one step's dependencies can create a cycle, so every save validates the whole graph.
- Metaphor-specific 3D files are deferred until the visual concept is chosen.

## Milestones

See the milestone table at the end of `frontend-spec.md` (M1 journey logic → M6 demo polish). M0 (scaffold) is done.
