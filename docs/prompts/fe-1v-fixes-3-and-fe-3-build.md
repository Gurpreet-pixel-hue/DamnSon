FE-1V Stage 1 review round 3 (Part A), then the FE-3 build (Part B). Branch: frontend.
Start: frontend = eb8e58b (PR #22 open, don't merge). main = e129422 (includes PL-2).
Read first: AGENTS.md, docs/visual-direction.md §3–§5 and §7, and PRD §8.8, §10.3 and §11.

Run every install as `npx -y npm@11.20.0 …`. Never run plain `npm install`.

Order:
1. Part A: push, report, then STOP.
2. Part B only after I write "PR #22 merged, start FE-3".

# Part A · FE-1V round 3 (H1–H5)

Review of eb8e58b (clean `npm ci` with npm 11.20.0, `npm run verify`, dev server, Chromium renders at 1440×900):
- Passed:
  - verify is green (21 files / 150 tests);
  - the numbers reproduce exactly: demo 23 / 58 / 113,115 / 166,223 and stress 25 / 61 / 142,022 / 202,325;
  - G1: no pin sits on a card;
  - G4: the drawer is non-modal, the scene stays sharp, and neighbouring stations stay in frame;
  - G6 is done;
  - only localhost requests, and the only console warning is THREE.Clock.
- Regression: the framed area of the city is now empty sand (H1). The G2 background metric passes, but it measured the wrong thing: it counted background pixels and never checked that the city is still there. H1 adds the missing check.

## H1 · The city must fill the framed area (high)
Measured with planCity on the demo and stress fixtures:
- 0 of the 260 buildings are within the station bounding box ±6 units in x and ±8 units in z;
- trees = 240, over the §3 cap of 180.

Cause: the board grew (G2), and cells are filled in row-major scan order. The 260-building cap is used up on far rows before the cells near the stations are reached.

Fix in planCity.ts:
- After classifying the cells, sort the candidate building cells by distance to the nearest station, with ties broken by the seeded rand. Fill nearest first until the cap.
- Do the same for trees, capped at 180.
- Keep the G3 rules unchanged: 9-cell plazas, and the 0.7× height cap within 3 cells.
- Far cells beyond the cap stay as low-detail ground texture or park. They are not empty.

Tests in planCity.test.ts, for demo and stress:
- at least 60 % of the non-road, non-plaza, non-water cells within 5 cells of any station hold a building;
- buildings ≤ 260 and trees ≤ 180;
- no building sits in a plaza cell.
Print the occupancy numbers in the report.

## H2 · Cards stay inside the safe area (high)
Cards are cut off at the viewport edges:
- demo: the first card reads "…] Verify digital", and "1 · START HERE" is clipped;
- stress: Portal Account, Municipal HQ, Revenue and Notary at the left, and Integrated Civic Registration Award at the right.

Fix:
- selectLabels clamps every card rect into the safe area (left/right 24 px, top 88 px below the top bar, bottom 110 px). The leader line bends back to the anchor.
- A candidate that would still collide after clamping is rejected, and the next candidate is tried.
- Stage headers follow the same clamp.
- Camera fit becomes a two-pass fit in computeSafeFit:
  1. fit the stations;
  2. project and measure the union of the placed card rects plus the headers;
  3. refit so that union sits inside the safe area with an 8 % margin (at most 2 iterations).
  - The world-unit paddings (0.8 / 1.0) are removed.
- Tests: for both fixtures at 1440×900 and 1280×800, every card and header rect lies inside the safe area. The report counts clipped elements from the render: it must be 0.

## H3 · Readable labels on small graphs (medium)
In the demo, all 13 labels are compact and truncated ("[Synthetic] Direct…"), although the space above and below the line is empty.
- Candidate slots per station, in this order:
  - full card above at −64, −128 and −192 px;
  - full card below at +64 and +128 px;
  - then compact cards at the same slots.
  - Each slot has a leader line to the anchor.
- Graphs with ≤ 16 stations: test that the demo at 1440×900 places at least 10 of 13 full cards, with 0 overlaps and 0 clipped.
- Graphs with > 16 stations: full cards only for next-up, selected, hovered and focused stations; the rest are compact. A pin stays the last resort.

## H4 · Accuracy of the PR body and the report (required)
- Remove the claim "Aligned ground colour #D8CBB5". palette.ts still has land `#E6DFD2`, and no docs changed this round.
- The fog is linear `THREE.Fog` (near/far), not exponential.
- Add to Deviations: components/ui/sheet.tsx gained a `showOverlay` prop. It is a shadcn file edit, backwards compatible.
- The sources line must list all packs from art/SOURCES.md: City Kit Commercial, Suburban, Industrial and Roads; Car Kit; Nature Kit; three boats.
- Update the budget table with the new measurements.

## H5 · Online pavilion (follow-up only)
In the selected view, the online_portal stand-in reads as a table. Record it in PR follow-ups for Stage 2. Don't change it now.

## Part A verify
1. `npm run verify`: paste the tail with per-file test counts.
2. The `npx -y npm@11.20.0 ci` tail.
3. Screenshots in .next/claude-review/fe-1v/:
   - default at 1440×900 and 1280×800;
   - stress with ?debug=1;
   - selected;
   - reduced motion;
   - the side-by-side with the reference.
4. Numbers verbatim:
   - demo and stress debug numbers;
   - the G2 background % at both sizes;
   - the H1 occupancy %, buildings and trees;
   - the H2 clipped-element count at both sizes;
   - the H3 full/compact counts.
5. Console shows only the THREE.Clock warning. Network requests go to localhost only.

Commits:
- fix(canvas): nearest-first city fill (visual-direction §3)
- fix(canvas): labels and headers clamped to the safe area (§4, §5)
- fix(canvas): stacked full-card slots for small graphs (§4)

Push frontend, then update the PR #22 body. STOP and report.

# Part B · FE-3 build: journey page, summary bar, share (only after "PR #22 merged, start FE-3")

Your plan is approved with the changes P1–P10 below. Build exactly the plan plus these changes.

Start:
- `git fetch origin --prune && git merge --ff-only origin/main && git log --oneline -3`. The merge must fast-forward; otherwise stop and report.
- Read node_modules/next/dist/docs on dynamic routes, async params/searchParams, `notFound()`, `not-found.tsx`, `loading.tsx` and `error.tsx`.

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

Commits:
- feat(journey): route, loader and states (§11.2)
- feat(graph): annual fee split and summary formatting (§8.8)
- feat(hud): summary bar and verification banner (visual-direction §8)
- feat(journey): share link with conflict handling (§8.8, §10.3)
- chore(app): remove dev fixture loader

Open PR frontend → main titled "FE-3: Journey page, summary bar, Share Journey". Its body contains the screenshots list, the verify tail, deviations and follow-ups. Don't merge.

# Ahead (context only)
| Milestone | Scope | Depends on |
|---|---|---|
| FE-4 | fact card, decisive questions, step drawer tabs (Overview / Documents / Fees / Source, verified date), Mark done + 8 s undo, not-needed list, 2D view | FE-3 |
| FE-5 | landing + search UI with location chip; lexical fallback | PL-4 (#10, after #9) |
| FE-6 | timeline, documents, source viewer, copilot panel, feedback, left navigation | PL-6 (#12), AI-4 |
| FE-7 | admin UI | PL-5 (#11) |
| FE-8 | performance, accessibility, polish; Stage 2 Blender heroes (incl. online pavilion); trip map P2 | FE-4+ |

Local first: no Vercel or cloud deploy until the demo works end to end on localhost.
