# M0 — Scaffold the DamnSon app and push it to `frontend`

You are the implementation agent for DamnSon (PSWB 02 · Municipal Bureaucracy Path Visualizer). Before planning, read `AGENTS.md`, `docs/ps.md`, `docs/techstack.md`, `docs/structure.md`, `docs/graph-data-schema.json` and `docs/examples/example-graph.json`.

**Goal:** bootstrap the empty GitHub repo, scaffold the app skeleton exactly as specified below, prove it works, and push it to a new `frontend` branch.

**In scope:** repo bootstrap, tooling, pinned dependencies, the folder structure with typed placeholders, the graph contract (zod mirror, analyzer, fixtures, tests), and a smoke-test shell (3D canvas, 2D view, HUD and admin placeholders, API stubs).
**Out of scope:** real civic data, visual design, feature UI, backend logic. List anything else under "Follow-ups" in your report.

First produce an implementation plan covering phases 0–9 and wait for my approval. Then execute phase by phase.

## Hard constraints
- Use exactly the commands and versions given. Install no packages beyond these and the ones the shadcn CLI adds itself.
- Never use `--force` or `--legacy-peer-deps`. On ERESOLVE, or any failure you can't fix within scope, stop and report.
- After phase 1, never commit to `main`. Never force-push. Don't merge or open a pull request.
- Commit nothing secret and no `.env` files. Don't edit `node_modules`.
- Don't disable lint rules, tests or tsconfig options to get green. If a generated shadcn file fails the strict settings, make the minimal type-safe fix in that file.
- Commands that need the network (`npx`, `npm install`, `git ls-remote`, `git push`) will ask for my approval. Request it; don't work around the sandbox.

## Phase 0 — Preflight (stop and report if anything fails)
1. `node -v` is v22.12 or newer (v24 preferred); `npm -v`; `git --version`.
2. `git config user.name` and `git config user.email` are set. If not, stop and ask me; don't invent an identity.
3. `git remote get-url origin` is `https://github.com/Gurpreet-pixel-hue/DamnSon.git` (case-insensitive, with or without `.git`). If this folder isn't a git repo yet, run `git init` and `git remote add origin https://github.com/Gurpreet-pixel-hue/DamnSon.git`.
4. `git ls-remote --heads origin` prints nothing (the remote is empty). If any branch exists, stop and don't overwrite anything.
5. These files exist: `AGENTS.md`, `README.md`, `.gitignore`, `.nvmrc`, `.agents/rules/3d-canvas.md`, `.agents/rules/graph-contract.md`, `.agents/workflows/verify.md`, `docs/ps.md`, `docs/techstack.md`, `docs/structure.md`, `docs/graph-data-schema.json`, `docs/examples/example-graph.json`, `docs/prompts/m0-scaffold.md`.

## Phase 1 — `main` (docs and rules only)
- `git add -A`
- `git commit -m "docs: add project spec, graph contract and agent rules"`
- `git branch -M main`
- `git push -u origin main`. If it fails with an authentication error, stop and tell me to run `gh auth login`.

## Phase 2 — Next.js scaffold on `frontend`
- `git switch -c frontend`
- `npx --yes create-next-app@16.3.6 damnson --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --no-react-compiler --disable-git --no-agents-md --skip-install --yes`
  Scaffold into a subfolder: create-next-app refuses a folder that already contains `AGENTS.md`, `README.md` or `.agents/`.
- `mv damnson/app damnson/package.json damnson/tsconfig.json damnson/next.config.ts damnson/next-env.d.ts damnson/eslint.config.mjs damnson/postcss.config.mjs .`
- `rm -rf damnson` (this drops its README, `.gitignore` and sample SVGs; ours stay)
- `npm install`
- Commit: `chore: scaffold Next.js 16.3.6 (App Router, TypeScript, Tailwind v4, ESLint)`

## Phase 3 — Dependencies (exact pins)
- `npm install --save-exact three@0.186.1 @react-three/fiber@9.8.1 @react-three/drei@10.7.9 @react-three/postprocessing@3.1.2 postprocessing@6.39.5 @xyflow/react@12.12.0 zustand@5.0.15 zod@4.6.5 motion@13.4.4 lucide-react@1.48.0 geist@1.7.2`
- `npm install --save-exact -D @types/node@24.19.0 @types/three@0.186.0 vitest@5.0.2 ajv@8.20.0 ajv-formats@3.0.1`
  Vitest 5 needs `@types/node` ≥ 22, and create-next-app ships ^20.
- Leave `typescript` (^5) and `eslint` (^9) as generated. TypeScript 7 and ESLint 10 break the lint toolchain.
- Commit: `chore: add 3D, 2D, state, validation, font and test dependencies`

## Phase 4 — shadcn/ui and fonts
- `npx --yes shadcn@4.21.0 init --base radix --preset nova --no-monorepo --yes`
- `npx --yes shadcn@4.21.0 add button input badge card sheet toggle-group table dialog tooltip --yes`
- If either shadcn command asks a question the flags don't answer, choose the default and note it in the report.
- `app/layout.tsx`:
  - Load fonts from the `geist` package: `import { GeistSans } from "geist/font/sans"` and `import { GeistMono } from "geist/font/mono"`, and apply `${GeistSans.variable} ${GeistMono.variable}` on `<html>`.
  - Remove every `next/font/google` import, so builds never need the network.
  - Add `dark` to the `<html>` className.
  - Metadata: title "Municipal Path Visualizer", description "See every step, office, fee and official link for a civic task."
- `app/globals.css`: keep what shadcn generated, and in the `.dark` block set `--background` to `#09090b`. No other theming yet.
- Commit: `chore: init shadcn/ui (radix, nova) and self-host Geist fonts`

## Phase 5 — Tooling
- `tsconfig.json`: add `"noUncheckedIndexedAccess": true` and `"noFallthroughCasesInSwitch": true`.
- `eslint.config.mjs`: add a config object with rules `"@typescript-eslint/no-explicit-any": "error"` and `"@typescript-eslint/ban-ts-comment": "error"`. Keep the existing ignores.
- `package.json` scripts:
  - Keep `dev`, `build` and `start` as generated.
  - `"lint": "eslint"`, `"test": "vitest run"`, `"test:watch": "vitest"`.
  - `"typecheck": "next typegen && tsc --noEmit"`. The layout uses the generated global `LayoutProps` type, so plain `tsc` fails on a fresh clone.
  - `"verify": "npm run lint && npm run typecheck && npm run test && npm run build"`.
  - Also add `"engines": { "node": ">=22.12.0" }`.
- `vitest.config.mts` (`.mts` because package.json has no `"type": "module"`):
  - `environment: "node"`, `include: ["**/*.test.ts"]`, `exclude: ["node_modules/**", ".next/**"]`.
  - Alias `"@"` → project root via `fileURLToPath(new URL("./", import.meta.url))`.
- Commit: `chore: strict TypeScript, lint rules, scripts and vitest config`

## Phase 6 — Graph contract (`lib/graph`, `data/`): pure TypeScript, no React
- `lib/graph/schema.ts`: a field-for-field zod 4 mirror of `docs/graph-data-schema.json`.
  - `z.strictObject` for every object, because the JSON Schema uses `additionalProperties: false`.
  - `z.discriminatedUnion` for `requirement`, `fee` and `processingTime` (key `kind`) and for `review` (key `status`).
  - Export `idSchema`: a 2–64 character string matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
  - URLs `z.url({ protocol: /^https$/ }).max(2048)`; dates `z.iso.date()`; `meta.updatedAt` `z.iso.datetime({ offset: true })`; integers `z.int()`; `keywords` unique via `.refine`.
  - Export the schemas and the inferred types `CivicTaskGraph`, `Step`, `Edge`, `Fee`, `Duration`.
- `lib/graph/officialSources.ts`: `isOfficialUrl(url: string): boolean`.
  - True only for `https` URLs whose hostname ends in `.gov.in` or `.nic.in` with at least one label before the suffix, or is listed in an exported `VETTED_OFFICIAL_HOSTS: readonly string[]`.
  - `VETTED_OFFICIAL_HOSTS` starts empty, with a comment: add a host only after manually confirming a government body runs it.
  - Malformed URLs return false.
- `lib/graph/analyzeGraph.ts`: export `analyzeGraph(graph: CivicTaskGraph): GraphAnalysis` with these types:
  - `type GraphIssueCode = "DUPLICATE_NODE_ID" | "DUPLICATE_EDGE_ID" | "UNKNOWN_NODE_REF" | "SELF_LOOP" | "DUPLICATE_EDGE" | "CYCLE" | "INVERTED_RANGE" | "VERIFIED_WITHOUT_OFFICIAL_SOURCE" | "NO_OFFICIAL_SOURCE" | "UNOFFICIAL_SOURCE"`
  - `interface GraphIssue { severity: "error" | "warning"; code: GraphIssueCode; message: string; nodeIds?: string[]; edgeIds?: string[] }`
  - `interface GraphAnalysis { ok: boolean; order: string[]; layers: string[][]; issues: GraphIssue[] }`
  - **Errors:** duplicate step id, duplicate edge id, edge to an unknown step, self-loop, duplicate `from → to` pair, cycle (list the step ids involved), fee range or processing time with `min > max`, and a step whose review is `verified` but has no official source.
  - **Warnings:** `NO_OFFICIAL_SOURCE` for a step with no official source, and one `UNOFFICIAL_SOURCE` per non-official source.
  - `order` uses Kahn's algorithm with ties broken by position in `nodes`, so it is deterministic.
  - `layers`: a step with no prerequisites is in layer 0; otherwise its layer is 1 + the max of its prerequisites' layers.
  - `ok` means no errors. When `ok` is false, `order` and `layers` are `[]`.
- Fixtures (pretty-printed JSON):
  - `data/fixtures/valid/example-graph.json` is a copy of `docs/examples/example-graph.json`.
  - `data/fixtures/invalid-schema/`: the valid example with ONE change each. Each must fail BOTH Ajv and zod.

    | File | Change |
    |---|---|
    | `stored-status.json` | add `"status": "locked"` to nodes[0] |
    | `stored-total.json` | add root `"totalEstimatedFees": 3200` |
    | `non-https-source.json` | nodes[0].sources[0].url → `http://www.india.gov.in/` |
    | `conditional-without-condition.json` | delete nodes[2].requirement.condition |
    | `verified-without-date.json` | delete nodes[0].review.verifiedOn |
    | `flagged-without-note.json` | delete nodes[2].review.note |
    | `fixed-fee-without-amount.json` | delete nodes[0].fee.amountINR |
    | `bad-id-format.json` | nodes[1].id → `"Site Inspection"` |

  - `data/fixtures/invalid-graph/`: schema-VALID, but `analyzeGraph` must return `ok: false` with the code shown.

    | File | Change | Expected code |
    |---|---|---|
    | `cycle.json` | add edge `e-issue-apply`: licence-issued → apply-online | `CYCLE` |
    | `unknown-ref.json` | add edge `e-ghost`: apply-online → ghost-step | `UNKNOWN_NODE_REF` |
    | `duplicate-node-id.json` | nodes[3].id → `site-inspection` | `DUPLICATE_NODE_ID` |
    | `duplicate-edge-id.json` | edges[0].id → `e-apply-fire` | `DUPLICATE_EDGE_ID` |
    | `self-loop.json` | add edge `e-self`: site-inspection → site-inspection | `SELF_LOOP` |
    | `duplicate-edge.json` | add edge `e-apply-inspect-2`: apply-online → site-inspection | `DUPLICATE_EDGE` |
    | `fee-range-inverted.json` | nodes[1].fee → range 2000–500, one_time | `INVERTED_RANGE` |
    | `duration-range-inverted.json` | nodes[1].processingTime → estimate 9–3 working days | `INVERTED_RANGE` |
    | `verified-without-official-source.json` | nodes[0].sources → `[]` (its review stays verified) | `VERIFIED_WITHOUT_OFFICIAL_SOURCE` |

- `lib/graph/graph.test.ts` (vitest):
  1. **Conformance:** for every fixture, Ajv (`import { Ajv2020 } from "ajv/dist/2020"` with `strict: true`, `allErrors: true`, plus `ajv-formats`) and `civicTaskGraphSchema.safeParse` must both give the folder's expected result. `valid/` and `invalid-graph/` are valid; `invalid-schema/` is invalid.
  2. **The example:**
     - `ok` is true.
     - `order` = `["apply-online", "site-inspection", "fire-clearance", "licence-issued"]`.
     - `layers` = `[["apply-online"], ["site-inspection", "fire-clearance"], ["licence-issued"]]`.
     - Warnings include `NO_OFFICIAL_SOURCE` for site-inspection and `UNOFFICIAL_SOURCE` for fire-clearance.
  3. **Invalid graphs:** every invalid-graph fixture gives `ok` false with its code present.
  4. **`isOfficialUrl`:**

     | URL | Expected |
     |---|---|
     | `https://portal.mcgm.gov.in/` | true |
     | `https://foscos.fssai.gov.in/` | true |
     | `https://example.nic.in/x` | true |
     | `http://portal.mcgm.gov.in/` | false |
     | `https://gov.in.evil.com/` | false |
     | `https://evilgov.in/` | false |
     | `https://example.com/` | false |
     | `not a url` | false |
- `data/README.md`: fixtures are test-only; `seed/` holds real graphs only when every step is verified against an official source, and stays empty until M1. Also add `data/seed/.gitkeep`.
- Commit: `feat(graph): graph contract, analyzer, official-source check, fixtures and tests`

## Phase 7 — App skeleton (placeholders; the client/server boundaries are the point)
- `lib/store/useViewStore.ts`: `viewMode: "3d" | "2d"` (default `"3d"`), `focusedStepId` and `hoveredStepId` (both `string | null`), with setters. Not persisted.
- `lib/store/useTaskStore.ts`:
  - State and actions: `activeTaskId`, `selectedStepId`, `completedByTask: Record<string, string[]>`, `setActiveTask`, `selectStep`, `toggleStepDone(taskId, stepId)`.
  - `persist` options: name `"damnson-progress-v1"`, `createJSONStorage(() => localStorage)`, `partialize` to `completedByTask` only, `skipHydration: true`.
- `components/explorer/ExplorerShell.tsx` (`"use client"`):
  - Full-viewport layout with a HUD overlay (SearchBar, ViewModeToggle) above the view area.
  - The view area renders SceneContainer or FlowchartView by `viewMode`, both via `next/dynamic(() => import(...), { ssr: false })` with a small loading fallback.
  - Also renders NodeDetailsDrawer and ProgressTracker, and calls `useTaskStore.persist.rehydrate()` in a `useEffect`.
- `components/canvas/SceneContainer.tsx` (`"use client"`, default export):
  - `<Canvas dpr={[1, 2]} camera={{ position: [10, 10, 10], fov: 45 }}>` with background `#09090b`.
  - Ambient light plus one directional light, drei `<Grid infiniteGrid />`, and one emissive cyan cube at `[0, 0.5, 0]`.
  - `<CameraRig />` and `<EffectComposer><Bloom mipmapBlur luminanceThreshold={0.6} intensity={0.6} /></EffectComposer>`.
  - This is a smoke test only; the real scene comes in M2.
- `components/canvas/CameraRig.tsx`: drei `<CameraControls makeDefault />` with min/max distance and a max polar angle, plus a `TODO(M2)` for focusing `focusedStepId`.
- `components/graph-2d/FlowchartView.tsx` (`"use client"`, default export): `<ReactFlow nodes={[]} edges={[]} colorMode="dark" fitView>` with `<Background />` and `<Controls />`. Import `"@xyflow/react/dist/style.css"`; the parent div is `h-full w-full`.
- `components/hud/`:
  - `SearchBar.tsx`: shadcn Input + Button, submit disabled, placeholder "Describe a civic task — e.g. register a cloud kitchen in Bandra".
  - `ViewModeToggle.tsx`: shadcn ToggleGroup bound to `useViewStore`; narrow the value without casts.
  - `NodeDetailsDrawer.tsx`: shadcn Sheet, open while `selectedStepId` is not null.
  - `ProgressTracker.tsx`: shadcn Card showing "0 of 0 steps done".
- `components/admin/`:
  - `GraphEditorTable.tsx`: shadcn Table with headers Step, Department, Review, Sources and an empty-state row.
  - `NodeFormModal.tsx`: shadcn Dialog placeholder.
- `app/page.tsx`: a server component that renders `<ExplorerShell />`.
- `app/admin/page.tsx`: heading "Admin — graph review" plus `<GraphEditorTable />`.
- `app/api/search-path/route.ts`, `POST`:
  - Invalid JSON → 400 `{ error: "invalid_json" }`.
  - Validate with `z.strictObject({ query: z.string().trim().min(3).max(300), location: z.string().trim().max(120).optional() })`. Failure → 400 `{ error: "invalid_request", issues: z.flattenError(error).fieldErrors }`.
  - Success → 501 `{ error: "not_implemented" }`.
- `app/api/admin/graphs/[taskId]/route.ts`, `GET` and `PUT`:
  - Signature `ctx: RouteContext<"/api/admin/graphs/[taskId]">`, then `const { taskId } = await ctx.params`.
  - A `taskId` that fails `idSchema` → 400 `{ error: "invalid_task_id" }`; otherwise 501 `{ error: "not_implemented" }`.
  - Comment: writes stay disabled until admin auth exists (M5).
- Placeholders are typed (explicit props types where a component takes props; no empty interfaces, which the lint config rejects), contain no `any` and no fake civic data, and show a visible "placeholder" label.
- Commit: `feat: app shell with 3D/2D smoke views, HUD and admin placeholders, stores and API stubs`

## Phase 8 — Verify (fix causes, never weaken checks)
1. `npm run verify`: lint, typecheck, test and build all pass.
2. Run `npm run dev` and check in your browser:
   - `http://localhost:3000` shows the grid and the glowing cube.
   - The toggle switches to the React Flow canvas and back.
   - `/admin` renders.
   - No console errors. The only acceptable warning is `THREE.Clock: This module has been deprecated` (from inside R3F).
   - Take screenshots of 3D, 2D and /admin.
3. With the dev server running:
   - `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/search-path -H "content-type: application/json" -d '{"query":"x"}'` → 400
   - the same with `'{"query":"register a cloud kitchen"}'` → 501
   - `curl -s -o /dev/null -w "%{http_code}" "localhost:3000/api/admin/graphs/BAD%20ID"` → 400
   - `curl -s -o /dev/null -w "%{http_code}" localhost:3000/api/admin/graphs/cloud-kitchen` → 501
4. Stop the dev server. `git status` shows no unexpected changes, and `AGENTS.md` is unchanged. It already contains the Next.js agent-rules block; if `next dev` modified it, show me the diff.

## Phase 9 — Push
- `git push -u origin frontend`. Don't merge and don't open a PR.

## Report (final message)
- Pass/fail per phase, and `git log --oneline main..frontend`
- `npm ls --depth=0`
- The file tree, excluding `node_modules`, `.next` and `.git`
- The tail of `npm run verify`, the four curl status codes, and the screenshots
- Any deviation from this prompt with its reason, plus follow-ups
