# FE-3.5 fixes 2: camera framing, card placement, honest evidence (PR #27)

Branch: `frontend`. Push fix commits so PR #27 updates. Don't merge, don't open a new PR, don't force-push.
Normative: `docs/visual-direction.md` §11.8 (new), plus the rest of §11.

## Why
On a real GPU, the stage view is a tiny, fogged speck, and the stage 3 view is a low horizon view. Your own `first-view.png` and `stage-3.png` show both. `road-closeup-zoom1/2/3.png` are one identical image. The report still said "Deviations: None".

The cause, confirmed in `CameraRig.tsx`: `fitToBox` padding is in world units, not pixels, and the `rotateTo` after the fit breaks the framing. With the angle set first and padding of about 1.5, stage 1 renders as a readable city view.

## Steps (one commit each)
1. `docs(visual-direction): §11.8 framing and placement fixes`: commit the uncommitted §11.8 edit and this prompt file unchanged.
2. `fix(canvas): frameView with pixel insets replaces fitToBox (§11.8)`
   - Add `components/canvas/camera/frameView.ts` with `frameView.test.ts`.
   - The rig uses a single `setLookAt` call.
   - Bottom inset for the stepper, right inset for the drawer.
   - Distance clamps; fog never covers the framed box.
3. `fix(canvas): cards avoid chips, stepper, drawer and each other (§11.8)`
   - Obstacles in `layoutStageCards`, with tests.
   - Layout only after the camera's rest event.
   - Tethers ≤ 140 px; compact cards, then "+N more".
   - Stage view shows only the focused and next chips; whole-route view culls chip collisions.
4. `feat(canvas): empty blocks become small parks (§11.8)`: stay within the §11.6 budgets.
5. `chore(art): capture checks for framing and overlap (§11.8)`: extend `capture-stage-focus.mjs`.

## Rules
- No new dependencies, no downloads.
- Run every install as `npx -y npm@11.20.0 …`.
- Use explicit `git add <paths>`, and never commit `docs/CivicWeave-Sprint-Plan.md`. Don't edit AGENTS.md.
- **Before you report, open and look at every screenshot.** Anything §11.8 lists as a defect that still shows is a deviation.

## Verify
- `npx -y npm@11.20.0 ci`, then `npm run verify`: green.
- No console errors except the THREE.Clock warning.
- Run the capture on a real GPU at 1440×900. Save the screenshots in `.next/claude-review/fe-3.5-stage-2/`:
  - first view of demo, example-startup and stress;
  - every stage of example-startup;
  - whole route of all three;
  - drawer open;
  - mark done, before and after;
  - three road close-ups at different distances.

## Report
- The `verify` tail with per-file counts.
- The §11.6 budget table, with the debug overlay text verbatim.
- For each fixture's first view: the camera distance, and whether the focused anchor is inside the safe rect.
- Example-startup stage 4:
  - card–card and card–obstacle overlap in px²;
  - maximum tether length;
  - chip collisions in whole-route view.
- The distances of the three close-ups, and each file's size in bytes.
- Screenshot paths.
- Deviations with numbers.

Then stop.
