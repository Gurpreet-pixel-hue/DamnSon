> Superseded where it differs by docs/prd/CivicWeave-PRD.md (v1.1). docs/frontend-spec.md stays normative for Civic Metro parameters.

# Tech Stack & Implementation Rules

v2, verified 2026-09-26. The whole set below was installed together and passed lint, typecheck, unit tests, a production build and a headless WebGL render.

## Versions (exact pins)

| Layer | Package | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | 24 LTS (min 22.12) | Next 16 needs ≥ 20.9; Vitest 5 needs ≥ 22.12 |
| Framework | `next` | 16.3.6 | App Router, Turbopack by default, `middleware.ts` renamed `proxy.ts`, route types come from `next typegen` |
| | `react`, `react-dom` | 19.2.8 | As pinned by create-next-app 16.3.6. R3F 9.8 supports React < 19.4 |
| Language | `typescript` | 5.9.x | **Not 7.x**: typescript-eslint supports TypeScript < 6.1 |
| Styling | `tailwindcss`, `@tailwindcss/postcss` | 4.3.x | CSS-first config in `app/globals.css` (`@theme`). There is no `tailwind.config.ts` |
| Lint | `eslint`, `eslint-config-next` | 9.x, 16.3.6 | **Not ESLint 10**: eslint-plugin-react (inside eslint-config-next) supports up to 9 |
| 3D | `three` / `@types/three` | 0.186.1 / 0.186.0 | Stay on 0.186.x: postprocessing 6.39 requires three < 0.187 |
| | `@react-three/fiber` | 9.8.1 | |
| | `@react-three/drei` | 10.7.9 | |
| | `@react-three/postprocessing`, `postprocessing` | 3.1.2, 6.39.5 | |
| 2D | `@xyflow/react` | 12.12.0 | React Flow for the 2D view (missing from v1 of this doc) |
| State | `zustand` | 5.0.15 | `persist` middleware for progress |
| Validation | `zod` | 4.6.5 | Runtime mirror of the graph contract |
| UI | `shadcn` CLI | 4.21.0 | `init --base radix --preset nova`; generates into `components/ui` |
| | `lucide-react` | 1.48.0 | |
| | `motion` | 13.4.4 | New name of framer-motion: `import { motion } from "motion/react"` |
| Fonts | `geist` | 1.7.2 | Self-hosted Geist. `next/font/google` downloads fonts at build time, which fails offline and in sandboxed agent terminals |
| Tests | `vitest` | 5.0.2 | Needs `@types/node` ≥ 22, so `@types/node` is pinned to 24.x (create-next-app ships ^20) |
| | `ajv`, `ajv-formats` | 8.20.0, 3.0.1 | Dev only: JSON Schema conformance tests |

Upgrade one package at a time with `npm run verify` green, and never use `--force` or `--legacy-peer-deps`.

## Architecture

- **Rendering boundaries.** `/` is a server component that renders one client boundary, `components/explorer/ExplorerShell.tsx`. The R3F canvas and React Flow are loaded from inside it with `next/dynamic(..., { ssr: false })`.
- **State split.**
  - `useTaskStore`: active task, selected step and completion. Persisted to localStorage with `skipHydration` and rehydrated in a client effect, which avoids hydration mismatches.
  - `useViewStore`: 3D/2D mode, focused step and hovered step. Not persisted.
  - Per-frame values (camera position, animation time) never go into React or zustand state; they live in refs and `useFrame`.
- **Graph contract.**
  - `docs/graph-data-schema.json` (JSON Schema 2020-12) is mirrored by `lib/graph/schema.ts` (zod). A conformance test runs both against shared fixtures so they cannot drift apart.
  - `lib/graph/analyzeGraph.ts` enforces integrity and returns a deterministic topological order plus parallel layers.
  - Status, positions, totals and the critical path are derived at runtime, never stored.
- **Official sources.** A URL counts as official only if it is `https` and its host ends in `.gov.in` or `.nic.in`, or it is on a vetted exception list (`lib/graph/officialSources.ts`).

## Frontend & 3D guidelines

1. **3D scene**
   - Keep geometry procedural or low-poly and instance repeated meshes.
   - A step's `officeType` selects its visual archetype.
   - Dependencies are curves with animated dash offsets; when there are more than 20, batch them into one geometry.
   - Use drei `<Html>` labels only for the focused or hovered step and small badges.
   - Camera moves use drei `<CameraControls>` smooth transitions, and are instant under `prefers-reduced-motion`.
   - The visual metaphor is **Civic Metro**. Exact parameters (geometry, colours, motion, camera, draw-call budget) are in `frontend-spec.md`, which wins over this summary if they differ.
2. **Performance budget**
   - 60 fps on a MacBook Air-class laptop.
   - ≤ 50 draw calls with 25 steps on screen.
   - `dpr={[1, 2]}`, shadows only on key meshes, one `EffectComposer`, and a `PerformanceMonitor` that switches effects off when the frame rate drops.
3. **Views**
   - The 3D ⇄ 2D toggle is instant.
   - The 2D view is the keyboard and screen-reader path, and the automatic fallback when WebGL is unavailable.
4. **Look**
   - Dark civic theme: zinc-950 `#09090b` background, cyan/emerald highlights, frosted panels (`backdrop-blur-md`).
   - HUD overlay above the canvas.
   - Text contrast ≥ 4.5:1.

## Code standards

- TypeScript `strict` plus `noUncheckedIndexedAccess`. `any` and `@ts-ignore` are lint errors.
- `components/ui` holds generated shadcn primitives only. Feature UI lives in `hud/`, `canvas/`, `graph-2d/`, `admin/` and `explorer/` (see `structure.md`). `lib/graph` is pure TypeScript with no React.
- API route handlers validate every input with zod, return 400 on bad input and never leak stack traces.
- Quality gate: `npm run verify` (lint → typecheck → test → build). `typecheck` runs `next typegen` first because layouts use the generated `LayoutProps` / `RouteContext` types.
- One known harmless console warning: `THREE.Clock: This module has been deprecated` comes from inside R3F 9.8 on three 0.186. Don't patch libraries to hide it.

## Backend & data plan (Milestone 5, not in the scaffold)

v1 of this doc had no extraction pipeline, no persistence and no admin auth. The plan:

- **Ingestion is admin-triggered, not per query.**
  1. Fetch allowlisted official pages and reduce them to readable text.
  2. Extract with an LLM whose structured output is constrained to the contract.
  3. Validate with zod and `analyzeGraph()`.
  4. Save as a draft with every step `unverified`.
  5. An admin verifies the steps, then publishes.
- **Citizen queries** match the text and location against published graphs (keywords plus LLM intent classification). Unmatched queries get suggestions. An on-the-fly AI draft is shown only with a clear unverified label.
- **LLM:** Gemini API via `@google/genai` with JSON-schema structured output. Confirm the model at Milestone 5.
- **Persistence and admin auth:** Supabase (Postgres JSONB documents with a revision number, plus Supabase Auth).
  - Serverless hosts have read-only filesystems, so admin edits can't be saved to JSON files in production.
  - Until Milestone 5, `data/seed/*.json` is read-only and the admin write routes return 501.
