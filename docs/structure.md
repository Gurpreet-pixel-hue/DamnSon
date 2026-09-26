# Repository Structure

`[M0]` = created by the scaffold prompt. `[M2]`–`[M5]` = created in that milestone. Paths are relative to the repo root (there is no `src/`).

```text
DamnSon/
├── AGENTS.md                         [M0] Always-on agent rules (ends with the Next.js managed block)
├── README.md  .gitignore  .nvmrc     [M0]
├── .agents/
│   ├── rules/3d-canvas.md            [M0] Auto-loads when touching components/canvas/**
│   ├── rules/graph-contract.md       [M0] Auto-loads for lib/graph/**, data/**, app/api/**
│   └── workflows/verify.md           [M0] /verify → lint, typecheck, test, build
├── docs/
│   ├── ps.md  techstack.md  structure.md
│   ├── graph-data-schema.json        [M0] Graph contract (JSON Schema 2020-12)
│   ├── examples/example-graph.json   [M0] Synthetic graph covering every variant
│   └── prompts/                      [M0] Prompts given to the implementation agent, one per milestone
├── app/
│   ├── layout.tsx                    [M0] Dark root layout, self-hosted Geist fonts, metadata
│   ├── globals.css                   [M0] Tailwind v4 + shadcn theme tokens (replaces tailwind.config.ts)
│   ├── page.tsx                      [M0] Explorer route → <ExplorerShell />
│   ├── admin/page.tsx                [M0] Admin: review and verify graphs (placeholder until M4)
│   └── api/
│       ├── search-path/route.ts      [M0] POST {query, location?}: zod-validated, 501 until M5
│       └── admin/graphs/[taskId]/route.ts  [M0] GET/PUT a whole graph: 501 until M5 (needs auth)
├── components/
│   ├── ui/                           [M0] shadcn primitives only (generated)
│   ├── explorer/ExplorerShell.tsx    [M0] Client boundary: HUD + 3D/2D switch (next/dynamic, ssr:false)
│   ├── canvas/                       3D (R3F), client-only
│   │   ├── SceneContainer.tsx        [M0] <Canvas>, lights, postprocessing, scene root
│   │   ├── CameraRig.tsx             [M0] CameraControls + focus transitions
│   │   └── StepNode3D.tsx, DependencyEdge3D.tsx, Ground.tsx, StepLabel.tsx   [M2] names/metaphor set after the ideas session
│   ├── graph-2d/FlowchartView.tsx    [M0] React Flow view, also the accessible fallback
│   ├── hud/                          [M0] SearchBar, ViewModeToggle, NodeDetailsDrawer, ProgressTracker
│   └── admin/                        [M0] GraphEditorTable, NodeFormModal (placeholders until M4)
├── lib/
│   ├── graph/
│   │   ├── schema.ts                 [M0] zod mirror of docs/graph-data-schema.json + inferred types
│   │   ├── analyzeGraph.ts           [M0] Integrity checks, topological order, parallel layers
│   │   ├── officialSources.ts        [M0] isOfficialUrl(): gov.in / nic.in + vetted exceptions
│   │   ├── graph.test.ts             [M0] Conformance (Ajv ⇄ zod) + algorithm tests
│   │   └── progress.ts, layout.ts    [M2–M3] Derived status, totals, critical path, 2D/3D positions
│   ├── store/
│   │   ├── useTaskStore.ts           [M0] Active task, selected step, completion (persisted)
│   │   └── useViewStore.ts           [M0] 3D/2D mode, focused/hovered step (ephemeral)
│   ├── data/graphRepository.ts       [M1] Load + validate graphs (seed files now, database in M5)
│   └── utils.ts                      [M0] cn() from shadcn
├── data/
│   ├── README.md                     [M0] What may go in fixtures vs seed
│   ├── fixtures/                     [M0] Test-only graphs: valid/, invalid-schema/, invalid-graph/
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

| | Milestone | Output |
|---|---|---|
| M0 | Scaffold | Repo bootstrap, app skeleton, graph contract + tests, 3D/2D smoke shell on `frontend` |
| M1 | Seed data | 2–3 real Mumbai procedures researched from official portals, verified, in `data/seed` |
| M2 | Visual concept + roadmap views | Chosen 3D metaphor, 2D flowchart, shared layout from `analyzeGraph` layers |
| M3 | Journey UX | Search/autocomplete, step drawer (forms, fees, documents, official links), progress + totals |
| M4 | Admin dashboard | Review/verify/edit steps, whole-graph validation, publish |
| M5 | Backend | Extraction pipeline, persistence, admin auth, search API |
| M6 | Demo polish | Performance pass, accessibility, fallback states, deployment |
