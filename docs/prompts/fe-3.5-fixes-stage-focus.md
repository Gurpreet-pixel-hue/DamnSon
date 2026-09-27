# FE-3.5 fixes: stage focus, stable cards, calm city (PR #27)

Branch: `frontend`. PR #27 stays open and gets these commits; do not open a new PR and do not merge.
Normative: `docs/visual-direction.md` §11 (new), plus §10.6 where §11 does not replace it. Also read AGENTS.md and PRD §8.8.

## Why
Gurpreet's review of PR #27 (48f1773):
- Labels still jump and stutter on hover and click.
- The first view is overwhelming.
- The city grid flashes and looks messy.

§11 records the root causes found in the code and renders, and the new design:
- only the current stage's cards show;
- the camera frames that stage;
- a stage stepper and the stage chips move between stages;
- calm, z-fight-free streets with routes on the roads;
- budgets met.

## Rules
- Only assets already in `art/src` plus procedural geometry. No downloads, no app installs, no new dependencies.
- Run every install as `npx -y npm@11.20.0 …`.
- Don't edit AGENTS.md. Use explicit `git add <paths>`, and never commit `docs/CivicWeave-Sprint-Plan.md`.
- A missed budget, or a rule you couldn't meet, is a deviation. List it under Deviations with the measured number.

## Steps (one commit each, in this order)
1. `docs(visual-direction): §11 stage focus, stable cards, calm city`: commit the uncommitted §11 edit and this prompt file unchanged.
2. `fix(canvas): z-fight-free layer heights, camera planes, palette roads, continuous grid (§11.5)`
   - Add a heights constants module with `heights.test.ts`.
   - Road instance y, plaza, ring and pulse heights from that module, with `polygonOffset` on flat decals.
   - Camera `near = 1`, `far = 400`.
   - Road colours from the palette.
   - No `tile-low` fallbacks, with the `roadGraph.test.ts` additions.
3. `feat(canvas): routes follow the streets (§11.5)`: `routeOnRoads.ts` with tests, a flat ribbon lane, pulses on the same polyline, the Bézier removed.
4. `feat(journey): stage focus model and stepper (§11.1, §11.3)`
   - `lib/graph/stages.ts` with `stages.test.ts`, and `focusStage` in `useViewStore`.
   - The stepper, clickable chips, "Back to current step", the `[` and `]` keys.
   - Auto-advance on mark done, and undo restoring focus.
   - Stage framing, the Whole route button, and the drawer as an overlay with no canvas resize.
5. `fix(canvas): stage cards that never jump (§11.2, §11.4)`
   - Replace the Key steps / All selection, pins and slot-indexed cards with one wrapper per station keyed by id.
   - No transform transitions.
   - `layoutStageCards.ts` with tests.
   - Fade out, glide, layout, fade in.
   - Dimmed non-focus stations and routes, 3D check discs for done stations, and the hover tooltip.
   - Remove the footer label toggle.
6. `perf(canvas): budgets in whole-route view (§11.6)`: the focus-radius colour lerp, ≤ 10 cars, far-LOD variants, lower-poly trees and road bevels, until every budget passes.
7. `chore(art): stage-focus capture script`: `art/tools/capture-stage-focus.mjs`, per §11.7.

## Verify
- `npx -y npm@11.20.0 ci`, then `npm run verify`: green.
- The browser console has no errors, except the THREE.Clock warning.
- No page scroll at 1440×900 and at 1280×800.
- Run the §11.7 capture on a real GPU. Save the screenshots in `.next/claude-review/fe-3.5-stage/`.

## Report
- The `npm ci` tail, and the `verify` tail with per-file test counts.
- The budget table (§11.6) for demo, example-startup and stress in whole-route view, and the numbers in the default stage view. Paste the debug overlay text verbatim.
- The capture numbers:
  - number of cards in the first view;
  - maximum wrapper displacement for hover, click and drawer, and mark done;
  - canvas size before and after the drawer opens;
  - the stage sequence while stepping.
- Screenshot paths.
- Deviations (every missed budget or rule, with numbers) and follow-ups.

Then stop and wait for review.
