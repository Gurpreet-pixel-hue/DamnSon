# FE-3.5 fixes 3: last polish before merge (PR #27)

Branch: `frontend`. Push to PR #27. Don't merge, don't force-push. Normative: `docs/visual-direction.md` §11.2, §11.4, §11.8 and AGENTS.md. No spec changes.

Review of 627c192: framing, the stage flow, the whole-route view and the budgets are good. Four defects remain, and all of them show in your own screenshots:

1. **The stepper covers the focused station** (`first-view-startup.png`, `drawer-open.png`: the lower half of the plaza ring sits under the stepper).
   - Cause: `frameView.ts` hard-codes `bottom: 68` ("44 + 24"). The rendered stepper is about 57 px tall and sits about 60 px above the canvas bottom, so its top is about 117 px up.
   - Fix: measure the stepper's DOM rect (`ResizeObserver`) and set the bottom inset to `canvasBottom − stepperTop + 16`. Apply the same fix in `layoutStageCards`' `DEFAULT_STAGE_INSETS`.
   - Add the plaza footprint (radius 2.4 at land height) to the stage box.
   - Capture check: the projected plaza bottom of every focused station lies at least 8 px above the stepper top.
2. **Non-focus rings aren't dimmed** (§11.2). `Stations.tsx:419` sets every ring to its full state colour × 1.4, so, for example, the blue stage-1 ring stays vivid in stage 4.
   - Rings of stations outside the focused stage get their state colour lerped 60 % toward `--cw-paper`, without the 1.4 multiplier.
   - Beacons stay only on focused stations.
3. **Allocations in `useFrame`** (AGENTS rule). `Stations.tsx` `useFrame` creates `new THREE.Color(...)` (`paperColor` and `baseColor`) for every station, every frame.
   - Hoist them to module-scope scratch colours.
   - Write instance colours only when `focusStage` or station states change, not every frame.
4. **You can't tell which card belongs to which station.**
   - Make each tether visible: a 1.5 px line in `#9A8E78`, running from the card edge to the building top (`position3D.y + 1.2`), not the fixed +2.6 anchor.
   - Place cards 24–48 px above the building top.
   - Compact cards keep the full title on up to 2 lines at 200 px (no ellipsis for titles of 40 characters or fewer).

## Commits
- `fix(canvas): measured stepper inset, plaza in frame (§11.8)`
- `fix(canvas): dim non-focus rings, no per-frame allocations (§11.2)`
- `fix(canvas): visible tethers to building tops, 2-line compact cards (§11.4)`

## Verify
- `npm run verify`: green.
- Run the capture on a real GPU at 1440×900. Screenshots in `.next/claude-review/fe-3.5-stage-3/`:
  - first view of all 3 fixtures;
  - example-startup stages 1–5;
  - drawer open;
  - mark done, before and 1 s after;
  - whole route.
- **Look at each screenshot before reporting.**

## Report
- The `verify` tail.
- The debug overlay text verbatim for all 3 fixtures.
- For each focused station: the plaza bottom y, the stepper top y and the gap.
- Stage 4 of example-startup: tether lengths and card overlap.
- Screenshot paths.
- **Deviations: list anything visibly wrong in the screenshots, even if a metric passes.** "None" is only acceptable when the screenshots are clean.

Then stop.
