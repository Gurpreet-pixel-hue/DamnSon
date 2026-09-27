# FE-4.5: stage navigation and big parallel stages

**Start only after PR #35 (FE-4 + fixes) is merged.** Branch: `frontend` (fast-forward to main first). Open PR `frontend → main` titled "FE-4.5: Stage navigation and parallel stages". Don't merge.
Normative: `docs/visual-direction.md` **§12.1–12.4** (new), plus §11. §12.5 and §12.6 are later; don't build them.

## Why
On start-business-mumbai, stage 4 has 15 parallel stations with no answers, or 10 with typical answers. The camera pulls back or pans, the in-world stage pills leave the screen, and there is no easy way to walk through the options. Gurpreet also wants the arrow keys to drive navigation.

## Build (one commit each)
1. `feat(canvas): one keyboard map for stages and stations (§12.1)`
   - ←/→ stages, ↑/↓ stations in tray order, Enter, Space, Esc, Home/End, `C`; `[` `]` kept as aliases.
   - One hook shared by 3D and 2D (extend `useSceneKeyboard`). Ignore keys while focus is in inputs.
   - A hidden live region announces the stage and station.
   - A "Keys" hint in the footer.
   - Tests for the pure key → action reducer (`lib/graph/navigation.ts`).
2. `feat(shell): always-visible stage bar (§12.2)`
   - The stepper becomes pills with names and counts. Pills collapse to numbers beyond the focused ±2 when there are more than 7 stages. The bar scrolls horizontally inside itself.
   - Only the focused stage keeps an in-world chip, pinned to the window edge with a chevron when its anchor is off-screen.
   - The bottom inset is measured from the bar.
3. `feat(canvas): parallel stage tray with numbered markers (§12.3)`
   - A 300 px overlay on the left edge; never resizes the canvas.
   - Grouped by module, with filter chips and counts; rows numbered `4.1…`.
   - Hover highlights the station; select (click or ↑/↓) glides the camera to that station (distance ≤ 24).
   - A "3 of 15" pager.
   - Numbered plaza markers as one instanced draw. In big stages, cards show only for the selected and hovered stations.
   - Auto-opens when the stage has more than 4 stations; collapses to a tab while the drawer is open. Shared by 2D.
   - Pure model in `lib/graph/stageTray.ts` with tests: ordering, grouping, filters, numbering stable across a recompose.
4. `feat(canvas): route declutter in stage view (§12.4)`
   - Only the routes into and out of the focused stage, plus the current → focused path. Whole route shows all.
   - Fan-out routes share the road trunk before splitting.
5. `chore(art): capture stage navigation`

## Rules
- No new dependencies; §11.6 budgets unchanged.
- Use explicit `git add <paths>`, never commit `docs/CivicWeave-Sprint-Plan.md`, and don't edit AGENTS.md or `lib/contract`.

## Verify
- `npm run verify`: green.
- No console errors except the THREE.Clock warning.
- No page scroll at 1440×900 and at 1280×800.
- Real GPU, with **DATA_SOURCE=files** for start-business-mumbai:
  - A keyboard walk: → to stage 4, then ↓ through all 15 stations. At every step the selected station is on screen with its card, and the stage bar is visible.
  - Record the stage bar rect and the in-world focused chip rect after each move. Both must be inside the window every time.
  - Filter "In person", then Enter to open the drawer; ↓ moves the drawer to the next in-person station.
  - Esc, then Esc.
  - The same walk in 2D.
- Capture example-startup and stress with DATA_SOURCE=fixtures.
- Screenshots in `.next/claude-review/fe-4.5/`, including stage 4 with the tray open, a numbered marker close-up, and the route declutter before and after.
- Check every file's size and open it before reporting.

## Report
- The `verify` tail.
- The keyboard-walk log (stage, station, bar rect, chip rect, camera distance) for stage 4.
- Draw and triangle numbers for stage 4.
- Screenshot paths with sizes.
- Deviations.

Then stop.
