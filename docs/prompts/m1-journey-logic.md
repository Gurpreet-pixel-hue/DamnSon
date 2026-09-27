# M1 — Journey logic, schema v2 and data layer (no UI)

You are the implementation agent for DamnSon. Before planning, read `AGENTS.md`, `docs/frontend-spec.md` (sections "The journey" and "Derived data"), `docs/graph-data-schema.json` (now v2) and `docs/examples/example-graph.json`.

**Goal:** implement everything the Civic Metro UI will compute: personalisation, step states, fee and time totals, critical path, office trips, metro layout and share state. Also build the graph repository and the synthetic demo data. It is pure TypeScript with exact tests. Branch: `frontend`.

**Out of scope:** any UI or 3D work (M2/M3), real civic data (M1-data), LLM or database work (M5).

First produce an implementation plan for phases 0–6 and wait for my approval.

## Hard constraints
- The M0 hard constraints still apply (no new packages, no `--force`, no weakening checks, never commit to `main`, no force-push).
- `lib/graph/*` stays pure: no React, no `fs`, no `window`. `fs` is only allowed in `lib/data/*`.
- Every function is deterministic: same input, same output order.

## Phase 0 — Preflight
1. `git switch frontend && git pull`.
2. The working tree is clean apart from the updated docs I unzipped (`AGENTS.md`, `.agents/rules/*`, `docs/*`).
3. Stash the doc changes, run `npm run verify`, and confirm it is green; then `git stash pop`.
   The existing tests will fail against the new v2 schema until Phase 1 is done. That's expected, and it's why the docs are committed together with Phase 1.
4. Remove the `"cn": ["./lib/utils"]` entry from `tsconfig.json` `paths`; shadcn components import `@/lib/utils`. If a future `shadcn add` generates `from "cn"`, rewrite that import to `@/lib/utils` instead of aliasing it.

## Phase 1 — Schema v2
- `lib/graph/schema.ts`:
  - `schemaVersion: z.literal(2)`.
  - New export `questionSchema = z.strictObject({ id: idSchema, text: z.string().min(5).max(160), help: z.string().max(300).optional() })`.
  - Root field `questions: z.array(questionSchema).max(10)`, placed before `nodes`.
  - The conditional requirement gains `appliesWhen: z.strictObject({ questionId: idSchema, answer: z.boolean() })` (required).
  - Export type `Question`.
- `lib/graph/analyzeGraph.ts` gets four new `GraphIssueCode` values:
  - `DUPLICATE_QUESTION_ID` (error)
  - `UNKNOWN_QUESTION_REF` (error): a conditional step's `appliesWhen.questionId` is not in `questions`
  - `OPTIONAL_PREREQUISITE` (error): an edge whose `from` step is optional
  - `UNUSED_QUESTION` (warning): a question no step uses
- Regenerate ALL fixtures from the new `docs/examples/example-graph.json`, using the same one-change rules as M0. Additions:
  - invalid-schema:
    - `conditional-without-applies-when.json` (delete nodes[2].requirement.appliesWhen)
    - `missing-questions.json` (delete root `questions`)
    - `old-schema-version.json` (`schemaVersion` = 1)
  - invalid-graph:
    - `unknown-question-ref.json` (nodes[2].requirement.appliesWhen.questionId = `ghost-question`) → `UNKNOWN_QUESTION_REF`
    - `duplicate-question-id.json` (push `{ "id": "large-premises", "text": "Duplicate question id here?" }`) → `DUPLICATE_QUESTION_ID`
    - `optional-prerequisite.json` (nodes[2].requirement = `{ "kind": "optional" }`) → `OPTIONAL_PREREQUISITE`
- The existing conformance and analyzer tests must cover the new files. Restructure the conformance tests as one `it` per fixture file (`it.each` over each directory listing), so a failure names the file.
- Commit the updated docs together with this phase, so every commit stays green: `feat(graph): schema v2 with situation questions, Civic Metro spec and M1 prompt`

## Phase 2 — Journey logic (`lib/graph`, one module each, with a co-located `*.test.ts`)

### `resolvePath.ts`
```ts
export type Answers = Readonly<Record<string, boolean>>;
export interface ResolvedPath { graph: CivicTaskGraph; excludedStepIds: string[]; undecidedStepIds: string[] }
export function resolvePath(graph: CivicTaskGraph, answers: Answers): ResolvedPath
```
- For each conditional step, read `answers[questionId]`:
  - missing → the step is **undecided** and stays in the graph;
  - equal to `appliesWhen.answer` → it applies and stays;
  - otherwise → it is **excluded**.
- Remove excluded steps in `nodes` order. For each one, connect every prerequisite to every dependent with a new edge `{ id: "bridge-<from>-<to>", from, to }`, skipping pairs that already exist. Then drop the removed step's edges.
- Surviving edges keep their original order, and bridges are appended.
- Never mutate the input.

### `progress.ts`
```ts
export type StepState = "done" | "available" | "locked";
export function deriveStepStates(graph: CivicTaskGraph, completed: ReadonlySet<string>): Map<string, StepState>
export function nextUpStepIds(graph: CivicTaskGraph, states: ReadonlyMap<string, StepState>): string[]
```
- A step is `done` if its id is in `completed`; otherwise `available` if all its prerequisites are done, else `locked`.
- `nextUpStepIds` returns the available non-optional steps in `analyzeGraph` order.
- Ids in `completed` that aren't in the graph are ignored.

### `totals.ts`
```ts
export interface FeeSummary { minINR: number; maxINR: number; unconfirmedCount: number; undecidedCount: number }
export interface TimeSummary { minDays: number; maxDays: number; unknownCount: number; criticalStepIds: string[] }
export function toCalendarDays(days: number, dayType: "working" | "calendar"): number // working → Math.ceil(days * 7 / 5)
export function summarizeFees(path: ResolvedPath, completed: ReadonlySet<string>): FeeSummary
export function summarizeTime(path: ResolvedPath, completed: ReadonlySet<string>): TimeSummary
```
- Both summaries skip optional steps and completed steps.
- **Fees:**
  - fixed adds the amount to min and max; range adds min and max; free adds 0.
  - variable and unknown fees add 1 to `unconfirmedCount`.
  - Undecided steps add to `maxINR` only, and increment `undecidedCount`.
- **Time:** longest path in `analyzeGraph` order.
  - A step's duration is `[toCalendarDays(min), toCalendarDays(max)]`.
  - `unknown` durations count 0 days and add 1 to `unknownCount`.
  - Undecided steps count 0 toward the min.
  - `finishMin(s) = max(finishMin(prereqs)) + dMin`, and likewise for max.
  - Totals are the maximum finish values.
  - `criticalStepIds` backtracks the max chain from the step with the largest `finishMax`. Ties go to the step or prerequisite that comes first in `nodes`.

### `trips.ts`
```ts
export interface OfficeTrip { key: string; name: string; officeType: Step["officeType"]; lat?: number; lng?: number; stepIds: string[] }
export function planOfficeTrips(path: ResolvedPath): OfficeTrip[]
```
- Include steps whose `mode` isn't `online` and which aren't optional, in `analyzeGraph` order.
- Group by `office.name ?? department`, with key = the lowercased name.
- Coordinates come from the first step in the group that has them.

### `layout.ts`
```ts
export const LAYOUT = { layerSpacing3D: 7, laneSpacing3D: 4.5, onlineHeight: 2.2, layerSpacing2D: 280, laneSpacing2D: 140 } as const;
export interface Placement { stepId: string; layer: number; lane: number; position3D: [number, number, number]; position2D: { x: number; y: number } }
export function computeMetroLayout(path: ResolvedPath): Placement[]
```
- Use the layers from `analyzeGraph(path.graph)`.
- Within a layer, sort steps by barycenter: the mean lane offset of their prerequisites, or 0 if they have none. Ties go to `nodes` order.
- For a step at index `i` in a layer of `n` steps: offset = `i − (n−1)/2`.
- `position3D = [layer*7, online ? 2.2 : 0, offset*4.5]` and `position2D = { x: layer*280, y: offset*140 }`.
- Output is in layer order, then lane order.

### `shareState.ts`
```ts
export interface ShareState { taskId: string; answers: Answers; completed: string[] }
export function encodeShareState(s: ShareState): string   // "task=<id>&a=<qid>.y,<qid>.n&done=<id>,<id>"
export function decodeShareState(params: URLSearchParams): ShareState | null
export function sanitizeShareState(s: ShareState, graph: CivicTaskGraph): ShareState
```
- **Encode** with `URLSearchParams`:
  - Answers sorted by question id; completed ids sorted.
  - Omit `a` or `done` when empty.
- **Decode** with zod:
  - An invalid or missing `task` returns null.
  - Malformed pairs or ids are dropped silently.
- **Sanitize** drops question ids and step ids that don't exist in the graph.

### Exact expectations (tests must assert these on `data/fixtures/valid/example-graph.json`; `{}` means no answers, `none` means no completed steps)

**`resolvePath`**
- `{}` → `undecidedStepIds` `["fire-clearance"]`, `excludedStepIds` `[]`, 4 nodes.
- `{"large-premises": false}` → excluded `["fire-clearance"]`. Edges, as `id:from>to`:
  - `e-apply-inspect:apply-online>site-inspection`
  - `e-inspect-issue:site-inspection>licence-issued`
  - `bridge-apply-online-licence-issued:apply-online>licence-issued`
  
  Layers `[["apply-online"],["site-inspection"],["licence-issued"]]`, `ok` true.
- `{"large-premises": true}` → nothing excluded or undecided.

**`deriveStepStates`**
- `{}` with none → apply-online available; site-inspection, fire-clearance and licence-issued locked.
- `{}` with `{apply-online}` → apply-online done; site-inspection and fire-clearance available; licence-issued locked.

**`summarizeFees`**

| Answers | Completed | Expected |
|---|---|---|
| `{}` | none | `{ minINR: 600, maxINR: 1600, unconfirmedCount: 1, undecidedCount: 1 }` |
| `{"large-premises": false}` | none | `{ 600, 1600, 0, 0 }` |
| `{"large-premises": true}` | none | `{ 600, 1600, 1, 0 }` |
| `{"large-premises": false}` | `{apply-online}` | `{ 500, 1500, 0, 0 }` |

**`summarizeTime`**

| Answers | Completed | Expected |
|---|---|---|
| `{}` | none | `{ minDays: 7, maxDays: 15, unknownCount: 1, criticalStepIds: ["apply-online","site-inspection","licence-issued"] }` |
| `{"large-premises": false}` | none | `{ 7, 15, 0, same critical path }` |
| `{"large-premises": false}` | `{apply-online, site-inspection}` | `{ 2, 3, 0, same critical path }` |

**`planOfficeTrips`**
- `{}` → `[["Example Ward Office", ["site-inspection"]], ["Example Fire Services", ["fire-clearance"]]]` (as `[name, stepIds]`).
- `{"large-premises": false}` → names `["Example Ward Office"]`.

**`computeMetroLayout`** with `{}` (as `[stepId, position3D, position2D]`):

| Step | position3D | position2D |
|---|---|---|
| `apply-online` | `[0, 2.2, 0]` | `{x:0, y:0}` |
| `site-inspection` | `[7, 0, -2.25]` | `{x:280, y:-70}` |
| `fire-clearance` | `[7, 0, 2.25]` | `{x:280, y:70}` |
| `licence-issued` | `[14, 2.2, 0]` | `{x:560, y:0}` |

**`encodeShareState`**
- `{ taskId: "example-diamond", answers: {"large-premises": false}, completed: ["site-inspection","apply-online"] }` → `task=example-diamond&a=large-premises.n&done=apply-online%2Csite-inspection`.
- Decode of that string round-trips. Sanitize drops `ghost-step` and `ghost-question`.

- Commit: `feat(graph): journey logic (resolve, states, totals, critical path, trips, layout, share state)`

## Phase 3 — Stores
- `useTaskStore` gains `answersByTask: Record<string, Record<string, boolean>>`, `setAnswer(taskId, questionId, answer)` and `clearAnswers(taskId)`.
- Persist `answersByTask` alongside `completedByTask`. Keep the storage name `damnson-progress-v1`, add `version: 1` and a `migrate` that fills missing fields with `{}`.
- Tests: toggling done and setting answers are immutable and per-task. Use vitest's node environment with an in-memory `StateStorage` passed to a factory. If needed, export `createTaskStore(storage)` and build the default store from it.
- Commit: `feat(store): persist situation answers per task`

## Phase 4 — Synthetic demo and stress fixtures
All titles start with `[Synthetic]`, departments start with `Example`, and sources are only `https://www.india.gov.in/` or `https://example.com/...`. Never use real fees, forms or portals here.
- `data/fixtures/demo/demo-metro.json`, taskId `demo-metro-synthetic`, must have:
  - 12–14 steps across ≥ 5 layers, with at least one layer of 3 parallel steps.
  - 3 questions, all used. At least 2 conditional steps: one that applies on `true`, one on `false`.
  - 1 optional leaf step.
  - Modes online / in_person / hybrid all present, and ≥ 8 distinct `officeType`s including `online_portal`.
  - Every fee kind and both duration kinds.
  - All three review states.
  - ≥ 3 offices with lat/lng inside Mumbai (lat 18.89–19.30, lng 72.77–72.99).
  - ≥ 3 edge notes, and ≥ 8 keywords.
- `data/fixtures/stress/stress-25.json`: 25 steps, 40 edges, ≥ 6 layers, all 12 `officeType`s, no questions.
- Tests:
  - Both files pass Ajv, zod and `analyzeGraph`.
  - For all 8 answer combinations of the demo, the resolved graph is `ok` and no two placements share a `position3D`.
  - The stress layout has 25 placements with unique positions.
- Commit: `test: synthetic demo and stress graphs`

## Phase 5 — Repository and search (`lib/data`)
- `graphRepository.ts`:
  - `createGraphRepository({ seedDir, demoDir, dataSource, nodeEnv })` returning `{ listTasks(): Promise<TaskSummary[]>; getGraph(taskId: string): Promise<CivicTaskGraph | null> }`, plus a default instance built from `process.env` and `path.join(process.cwd(), "data/...")`.
  - `TaskSummary = { taskId, title, summary, category, city, keywords, stepCount, verifiedStepCount, synthetic: boolean }`.
  - Always reads `data/seed/*.json`. Also reads `data/fixtures/demo/*.json` when `dataSource === "fixtures"`; in that case `synthetic` is true.
  - If `nodeEnv === "production"` and `dataSource === "fixtures"`, throw at creation.
  - Every file is parsed with zod and must pass `analyzeGraph`. Invalid files and duplicate taskIds are skipped with one `console.error` naming the file and issue codes; they are never returned.
- `search.ts`: pure `searchTasks(tasks: TaskSummary[], query: string, limit = 8): TaskSummary[]`.
  - Lowercase, split on non-alphanumerics, and drop tokens shorter than 2 characters.
  - Per token: +3 if a title word starts with it, +2 if any keyword contains it, +1 if the summary contains it.
  - Keep scores above 0, sort by score (descending) then title, and return at most `limit`.
- Tests:
  - Use temp dirs (`fs.mkdtempSync`) with one valid file, one invalid-graph file and one duplicate.
  - The production + fixtures combination throws.
  - Search ranking on an inline list of 4 summaries.
- `app/api/search-path/route.ts`: a valid body now returns 200 `{ results: TaskSummary[] }` from `searchTasks(await repo.listTasks(), query)`. Keep the 400 paths.
- Add `.env.example` containing `# DATA_SOURCE=fixtures  (development only: loads data/fixtures/demo)`.
- Commit: `feat(data): graph repository with dev-only fixtures and task search`

## Phase 6 — Verify and push
1. `npm run verify` is green. Report the test count per file.
2. Create `.env.local` with `DATA_SOURCE=fixtures` (it's gitignored), run `npm run dev`, and check:
   - `curl -s -X POST localhost:3000/api/search-path -H "content-type: application/json" -d '{"query":"synthetic metro"}'` returns the demo task.
   - `{"query":"x"}` returns 400.
3. Stop the server and delete `.env.local`. `git status` is clean.
4. `git push`.

## Report
- Pass/fail per phase and `git log --oneline -8`
- Test counts, the verify tail and the curl outputs
- A table of the demo graph: step id, layer, lane, mode, officeType, requirement
- Deviations with reasons, plus follow-ups
