# CivicWeave (DamnSon): Municipal Bureaucracy Path Visualizer (PSWB 02)

The single source of truth is docs/prd/CivicWeave-PRD.md (v1.2). Read "What changed in 1.2",
§8.8, §9.1, §10.3, §11, §13 (engineering rules and folder ownership) and the sections for your task before planning.
docs/visual-direction.md holds the Civic Metro visual parameters and §9 app shell spec.

## Core Rules & Non-Negotiables
- If a request conflicts with the PRD, stop and ask: name the PRD section and offer
  (a) follow the PRD, (b) change the PRD first, (c) a compliant alternative. Never deviate silently.
- Build P0 before P1 and P1 before P2 (PRD §2.2). Later items are not built.
- Never invent fees, forms, timelines, thresholds, addresses or URLs. Show "not verified" instead.
- Stay in your lane's folders (PRD §13.2). lib/contract, lib/server and app/api are strictly regulated.
- Git: long-lived branches are main, frontend, backend. Never commit to main directly. No force-push.
  Conventional Commits. Cite PRD sections. Evidence in reports is pasted verbatim from real runs.
  Never add AI attribution or bot co-authors to git commits.
- Zero Emojis in UI: Use purposeful SVG glyphs, typographic badges, or crisp micro-copy.
- Strict Anti-Vibecoding Aesthetic: Nuanced monochromatic tints, crisp 1px border contrast, consistent radii, WCAG AA contrast.
- Never commit secrets (.env* untracked, only .env.example). The Supabase secret key is never deployed.
- Versions are pinned exactly (PRD §13.4): three 0.186.x, React < 19.4, TypeScript 5.x, ESLint 9.x,
  Prisma 7.10.x. Never --force or --legacy-peer-deps; on ERESOLVE stop and report. Always run npm installs with `npx -y npm@11.20.0 …`.
- TypeScript strict + noUncheckedIndexedAccess; no any, no @ts-ignore, no hiding casts; zod at boundaries.
- Server components by default; three/R3F, React Flow, window, storage = client components loaded with
  next/dynamic(..., { ssr: false }). lib/server files start with import "server-only".
- Every 3D interaction has a 2D/keyboard equivalent; respect prefers-reduced-motion.
- Done = npm run verify (`lint`, `typecheck`, `vitest`, `build`) green + browser check with no console errors
  (only the THREE.Clock deprecation warning is allowed) + screenshots for UI work.

## Directory Structure
- `app/`
  - `page.tsx`: Home template index listing published journeys or rendering empty state ("No published journeys yet").
  - `journey/[taskId]/`:
    - `page.tsx`: Dynamic journey route with server-side `generateMetadata` and `loadJourneyPage`.
    - `loadJourneyPage.ts`: Testable page logic using `JourneyRepository` without importing `server-only` in vitest.
    - `loading.tsx`: 72px top bar, left rail, and 3D card skeleton.
    - `not-found.tsx`: 404 state for unknown journeys.
    - `error.tsx`: Client error boundary with Retry for repository/compose failures.
- `components/`
  - `shell/`:
    - `JourneyShell.tsx`: Container orchestrating top bar, banners, left rail, framed 3D window, and docked drawer.
    - `TopBar.tsx`: 72px header with brand mark, journey chip (with 3px progress bar), location chip, 4 summary tiles, and Share button.
    - `LeftRail.tsx`: Nav rail (Home, My Journey) collapsing to 64px below 1440px.
    - `WindowCard.tsx`: Framed 3D window card (`calc(100dvh - 120px)`, min 560px), 56px header band, 52px footer (legend, critical path, 2D/3D toggle, fullscreen), and debug overlay.
    - `RightDrawer.tsx`: Docked 380px inspector column (240ms transition, Escape key to close).
    - `ConflictBanner.tsx`: Shared link vs local progress conflict resolution banner ("Apply shared link" / "Keep mine").
  - `hud/`:
    - `SummaryBar.tsx`: 4 summary tiles (Next up, Estimated fee, Total time, Office visits) and `deriveSummaryValues`.
    - `VerificationBanner.tsx`: Unverified and flagged action step review state counts.
  - `canvas/`:
    - `SceneContainer.tsx`, `MetroScene.tsx`, `CameraRig.tsx` (returns to safe-fit overview on drawer close/Escape).
    - `city/planCity.ts`: Procedural city grid with station distance zoning (<=320k triangles target).
    - `camera/computeSafeFit.ts`: Two-pass frustum fitting using card insets (top 56, bottom 52, left 16, right 16).
    - `labels/selectLabels.ts`: Greedy label placement with priority collision avoidance (stage headers have priority).
- `lib/`
  - `graph/`: `totals.ts` (with annual fee split), `summary.ts` (currency & duration formatting), `useShareJourney.ts`, `shareState.ts`, `safeCompose.ts`, `viewModel.ts`.
  - `store/`: `useTaskStore.ts` (persisted state with immutable `setCompleted`), `useViewStore.ts`.
  - `server/`: `journeys/` (`fileRepository.ts`, `search.ts`).
  - `contract/`: Zod schemas and validation.
- `data/`:
  - `seed/`: Verified production templates (empty on main until PL-2).
  - `fixtures/v3/`: Synthetic development fixtures (`demo-metro-synthetic`, `stress-25-synthetic`, `example-startup`).

## Verification Commands
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Tests: `npm run test` or `npx vitest run`
- Build: `npm run build`
- Full Verify: `npm run verify`
- CI Clean Install: `npx -y npm@11.20.0 ci`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
