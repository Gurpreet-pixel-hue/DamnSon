# DamnSon — Municipal Bureaucracy Path Visualizer (PSWB 02)

A citizen describes a civic task in plain language (e.g. "register a cloud kitchen in Bandra"). The app shows the procedure as an interactive dependency graph (3D spatial view plus 2D flowchart) with official links, fees, timelines and progress tracking, and an admin dashboard verifies the data.

Read before planning anything these cover:
- `docs/ps.md`: problem statement and requirements
- `docs/techstack.md`: pinned versions, architecture, performance budget, backend plan
- `docs/structure.md`: where files go, milestones
- `docs/graph-data-schema.json`: the graph data contract (example: `docs/examples/example-graph.json`)

## Working agreement
- Plan first and wait for approval on multi-file work. Stay inside the task's scope; list anything else as a follow-up.
- Git: never commit to `main` directly (it only receives reviewed merges). Work on the branch named in the task. Never force-push, rewrite pushed history, merge or open PRs unless asked. Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Never commit secrets. `.env*` stays untracked; only `.env.example` may be committed.
- Don't edit `node_modules`, and don't disable lint rules, type checks or tests to get green.

## Commands
- `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm run test` · `npm run verify` (all four gates)
- Done means: `npm run verify` passes, and for UI work the dev server was checked in the browser with no console errors (screenshots in the report). The only known harmless console warning is `THREE.Clock: This module has been deprecated`.

## Dependencies
- Versions are pinned exactly in `package.json`. Adding or upgrading a package must be justified in the plan.
- Hard limits: `three` stays 0.186.x, React stays below 19.4, TypeScript stays 5.x, ESLint stays 9.x (reasons in `docs/techstack.md`).
- Never use `--force` or `--legacy-peer-deps`. On ERESOLVE, stop and report.

## Code rules
- TypeScript strict with `noUncheckedIndexedAccess`. No `any`, no `@ts-ignore`, no casts that hide type errors. Parse unknown data with zod.
- Server components by default. Anything touching three/R3F, React Flow, `window` or `localStorage` is a client component, and WebGL/React Flow views are loaded with `next/dynamic(..., { ssr: false })` from a client component.
- Folders: `components/ui` holds generated shadcn primitives only. HUD goes in `components/hud`, 3D in `components/canvas`, 2D in `components/graph-2d`, admin UI in `components/admin`. `lib/graph` is pure TypeScript (no React) and `lib/store` holds zustand stores.
- State: `useTaskStore` holds task and progress (persisted); `useViewStore` holds view and interaction state (not persisted). Never put per-frame values such as camera position or animation time in React or zustand state.
- Graph data must pass `civicTaskGraphSchema` (zod) and `analyzeGraph()` before it is rendered or saved. User status, step order, layers, positions and totals are derived and never stored.
- Official links: `https` only. "Official" means `isOfficialUrl()` (`.gov.in`, `.nic.in`, vetted exceptions), never a `.gov` check. Missing data renders an explicit "not verified" state; never invent fees, forms, timelines or URLs.
- No mock data in production code paths. Fixtures live in `data/fixtures` and only tests import them.
- Accessibility: every 3D interaction has a 2D/keyboard equivalent, and motion respects `prefers-reduced-motion`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
