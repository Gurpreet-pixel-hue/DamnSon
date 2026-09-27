FE-3 build: app shell, journey page, summary bar, Share Journey (branch frontend)
Supersedes Part B of docs/prompts/fe-1v-fixes-3-and-fe-3-build.md. Start only after I write "PR #22 merged, start FE-3".

Needs on main: PR #22 (FE-1V), PR #23 (PRD 1.2) and PR #24 (CI installs with npm 11.20.0). All three are merged: main = d288f0e.

Read first:
- AGENTS.md;
- PRD "What changed in 1.2", §8.8, §10.3, §11 and §16.3 D20;
- docs/visual-direction.md §9.1 (app shell, normative) and §8;
- node_modules/next/dist/docs on dynamic routes, async params/searchParams, notFound(), not-found.tsx, loading.tsx and error.tsx.

Run every install as `npx -y npm@11.20.0 …`. FE-3 adds no dependencies; GSAP arrives in FE-5.

Start:
1. `git fetch origin --prune && git merge --ff-only origin/main && git log --oneline -3`. The merge must fast-forward; otherwise stop and report. The uncommitted docs/visual-direction.md edit stays in the working tree.
2. Commit that docs/visual-direction.md edit unchanged: the new §9 and two §8 rows. Include this prompt file in the same commit:
   `docs(visual-direction): §9 app shell, intro and transitions (PRD 1.2)`.

Your FE-3 plan (from your last report) is approved with the changes P1–P12 below. Build exactly the plan plus these changes.

Changes to your plan:
- **P1 · No duplicate derivations.**
  - `summarizeFees`, `summarizeTime` and `planOfficeTrips` already exist in lib/graph/totals.ts and trips.ts. lib/graph/summary.ts only formats: `formatFees(FeeSummary)`, `formatTime(TimeSummary, titles)`, `formatNextUp(ids, titles)`, `formatOfficeVisits(OfficeTrip[])`.
  - `FeeSummary` has no annual split, yet §8.8 labels annual fees "per year". Extend `summarizeFees` so annual fees stay out of the one-time totals and are reported as `annualMinINR` / `annualMaxINR` (plus `annualUnconfirmedCount` if needed). Add tests to totals.test.ts.
- **P2 · Real review states.** The contract's `review.status` is `unverified | verified | flagged`. There is no `community_reported`.
  - The banner counts unverified and flagged action steps separately: "N steps aren't verified yet" and "M steps are flagged as possibly out of date". Both say "check the official source before acting".
  - Milestones are excluded.
- **P3 · Hydration before share handling.** The store uses `skipHydration`. Run the share/conflict logic only after `useTaskStore.persist.rehydrate()` has finished (`persist.hasHydrated()` / `onFinishHydration`). Otherwise local progress looks empty and the shared link silently overwrites it.
- **P4 · Canonical compare, no mutation.**
  - Sanitize both sides with `sanitizeShareState` against the composed journey.
  - Compare facts with keys sorted, and completed ids as sorted copies.
  - Never call `.sort()` on store arrays.
- **P5 · Fee copy.**
  - "Free" only when min = max = 0, `unconfirmedCount` = 0, `mayApplyCount` = 0 and there are no annual fees.
  - Otherwise "₹0" plus the qualifiers, e.g. "₹0 + 2 fees to confirm".
  - Conditional amounts read "(up to ₹X more if conditions apply)".
- **P6 · Next up.** Show at most 2 titles, then "+N more". When every action step is done: "All steps done".
- **P7 · Office visits.** "No office visits" when there are no in-person trips. Never write "100 % online" unless every remaining action step is online.
- **P8 · Testable page logic without server-only in tests.**
  - Put the load logic in `app/journey/[taskId]/loadJourneyPage.ts`: `loadJourneyPage(repo: JourneyRepository, taskId)` returns `{kind:"ok",data} | {kind:"not_found"} | {kind:"invalid", issues}`.
  - The page passes `getJourneyRepository()`.
  - Test it with a fake repository. Don't import "server-only" modules into vitest.
- **P9 · States.**
  - Add `app/journey/[taskId]/error.tsx` (client component, "Could not load this journey", with Retry) for repository failures.
  - `/` shows "No published journeys yet" when the list is empty.
  - Add `generateMetadata` with the journey title.
- **P10 · Lanes.** No edits in lib/contract, lib/server or app/api. If one is needed, stop and list it for Divvye.

- **P11 · App shell (visual-direction §9.1, D20).** FE-3 builds the shell, and every later milestone fills a slot in it.
  - **Top bar, 72 px:**
    - brand: an original mark plus "CivicWeave" and "Your city. In order.";
    - journey chip, with the pencil linking to `/`, and a 3 px progress bar under it;
    - location chip from the template's jurisdiction;
    - four summary tiles;
    - Share Journey.
  - **Left rail:** Home and My Journey only. It collapses to 64 px icons below 1440 px.
  - **3D window:**
    - a card with radius 16 and height `calc(100dvh - 120px)`, at least 560 px;
    - stage-header band 56 px inside the top;
    - footer 52 px with the legend, the 3D/2D and critical-path toggles, and fullscreen;
    - the debug overlay inside the card.
  - **Right drawer:** a docked 380 px grid column, replacing the Sheet overlay.
    - It opens over 240 ms, or instantly under reduced motion.
    - The camera refits to the new card size, and the canvas never scales.
    - Escape closes it.
  - **1024–1279 px:** the rail shows icons only and the drawer overlays the window.
  - **Below 1024 px:** the 2D fallback note stays as it is (FE-4 builds 2D).
  - **Safe-area insets move to the card** (top 56, bottom 52, left/right 16):
    - computeSafeFit takes the card's size;
    - update its tests and the selectLabels tests (0 clipped at 1440×900 and 1280×800 inside the card);
    - the H1–H3 metrics must still pass.
  - **The old floating HUD is removed:** SearchBar (search moves to the landing in FE-5), ViewModeToggle position, the ProgressTracker card and the floating legend.
  - **Performance:**
    - the canvas resizes through R3F's resize observer only;
    - no re-mount of the canvas when the drawer opens;
    - the draw and triangle numbers from round 3 must not grow.

- **P12 · FE-1V round-3 follow-ups** (found in my review of 4275342, merged as #22):
  - Stress scene triangles are 358,110, over the 350k target (the hard limit is 500k). Demo is 345,018. Bring both to ≤ 320k:
    - use LOW_DETAIL buildings for every city cell farther than 5 cells from any station (today the split is by distance from the camera target);
    - keep the ≤ 260 and ≤ 180 caps and the H1 occupancy test.
  - On the stress graph, label cards cover stage headers ("3 · IN PARALLEL (4)", "7 · IN PARALLEL (3)"). Put headers into the same collision pass as cards and pins. Headers have priority and cards move to their next slot. Add a test: no card rect intersects a header rect.
  - Escape and closing the drawer return the camera to the safe-fit overview (a 0.6 s transition, instant under reduced motion), instead of staying zoomed on the station.

Unchanged from your plan:
- the share URL per §8.8 (`/journey/<taskId>?task=…&f=…&done=…`);
- "Keep mine" clears the params with `history.replaceState`;
- delete app/loadJourney.ts;
- stress at `/journey/stress-25-synthetic`;
- `?debug=1` kept;
- `?graph=broken` replaced by a test.

Verify:
1. `npm run verify` (per-file counts) and the `npx -y npm@11.20.0 ci` tail.
2. Screenshots at 1440×900 in .next/claude-review/fe-3/:
   - `/` with the list and with an empty list;
   - `/journey/demo-metro-synthetic`;
   - `/journey/stress-25-synthetic` with ?debug=1;
   - a 404;
   - the error state;
   - the partially-verified banner;
   - the shared-link conflict banner;
   - the "Link copied" state.
3. The summary bar values for demo and stress, verbatim, next to the raw `FeeSummary` / `TimeSummary` objects.
4. A shared-link round trip: copy the link, open it in a fresh profile, and show the same facts and done steps.
5. Console shows only the THREE.Clock warning. Network requests go to localhost only.
6. `npm run build && npm start` with `DATA_SOURCE=files`: `/` shows the empty state, because data/seed on main is still empty. No crash.

Extra verify for P11:
- Screenshots at 1440×900 and 1280×800 of `/journey/demo-metro-synthetic`:
  - drawer closed;
  - drawer open.
- Put one side-by-side with docs/reference/civic-metro-target.jpg (shell composition) in .next/claude-review/fe-3/.
- Report the debug numbers with the drawer closed and open.

Commits:
- feat(shell): journey app shell with framed 3D window (visual-direction §9.1)
- feat(journey): route, loader and states (§11.2)
- feat(graph): annual fee split and summary formatting (§8.8)
- feat(hud): summary bar and verification banner (visual-direction §8)
- feat(journey): share link with conflict handling (§8.8, §10.3)
- chore(app): remove dev fixture loader

Open PR frontend → main titled "FE-3: Journey page, summary bar, Share Journey". Its body contains the screenshots list, the verify tail, deviations and follow-ups. Don't merge.

# Ahead (context only; don't start)
| Milestone | Scope | Depends on |
|---|---|---|
| FE-4 | fact card, decisive questions, drawer content (Overview / Documents / Fees / Source tabs, verified date, Mark done + 8 s undo), not-needed list, 2D panel below the window | FE-3 |
| FE-5 | landing with natural-language search + fact card + questions (P0); intro sequence (P1, visual-direction §9.2, gsap 3.15.0); landing → journey 3D entrance (P1, §9.4) | FE-4, PL-4 (#10) |
| FE-6 | rail pages: checklist, documents, office visits, resources; timeline, source viewer, copilot panel, feedback | PL-6, AI-4 |
| FE-7 | admin UI | PL-5 |
| FE-8 | performance, accessibility, polish; Stage 2 Blender heroes; trip plan below the window (P2) | FE-4+ |

Local first: no Vercel or cloud deploy until the demo works end to end on localhost.
