# Frontend Structure & Architecture

## Overview
CivicWeave frontend architecture for the Journey Page and Civic Metro 3D map.

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
    - `WindowCard.tsx`: Framed 3D window card (`calc(100dvh - 120px)`, min 480px), 56px header band, 52px footer (legend, critical path, 2D/3D toggle, fullscreen), and debug overlay.
    - `RightDrawer.tsx`: Docked 380px inspector column (240ms transition, Escape key to close).
    - `ConflictBanner.tsx`: Shared link vs local progress conflict resolution banner ("Apply shared link" / "Keep mine").
  - `hud/`:
    - `SummaryBar.tsx`: 4 summary tiles (Next up, Estimated fee, Total time, Office visits) and `deriveSummaryValues`.
    - `VerificationBanner.tsx`: Unverified and flagged action step review state counts.
  - `canvas/`:
    - `SceneContainer.tsx`, `MetroScene.tsx`, `CameraRig.tsx` (returns to safe-fit overview on drawer close/Escape).
    - `city/planCity.ts`: Procedural city grid with station distance zoning (≤300k triangles target).
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
- Full Verify: `npm run verify`
- CI Clean Install: `npx -y npm@11.20.0 ci`
