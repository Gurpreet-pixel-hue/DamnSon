# FE-4 build: step drawer, fact card, questions, not-needed list, 2D view

Branch: `frontend` (fast-forwarded to main 82d0eb9). Open PR `frontend → main` titled "FE-4: Step drawer, your situation, 2D view". Don't merge.
Read: AGENTS.md; PRD §4.3, §8.6, §8.8, §11.1–11.3, §11.6; `docs/frontend-spec.md` ("2D view", "HUD"); `docs/visual-direction.md` §9.1 and §11.

Your plan is approved with the amendments below. **Where an amendment disagrees with the plan, the amendment wins.**

## Amendments
1. **Never invent text** (AGENTS.md: "Show 'not verified' instead").
   - Remove the fallbacks "Official procedural step required for civic compliance." and "Mandatory step for all applicants".
   - `description` is a required string: when it's empty, hide the block.
   - `requirement` always exists (schema): render it as it is.
   - Forms: an empty array shows "No forms listed", not "No forms required".
   - The office card shows only for `in_person` and `hybrid` steps. For online steps, show `applicationPortal`, or "Portal not verified" when it's missing.
   - Google Maps link: only from `office.lat`/`lng`, or else from `office.address`. With neither, show "Location not verified" and no link.
2. **No new test dependencies.**
   - `main` has no jsdom or @testing-library. Don't add them.
   - Put the logic in pure modules with `.test.ts` tests. Components stay thin renderers:
     - `lib/graph/drawerModel.ts`: the tab contents and the whole fallback matrix;
     - `lib/graph/factEditors.ts`: the editable facts and the editor kind per registry type;
     - `lib/graph/flow2d.ts`: nodes, edges and their styles;
     - `lib/graph/recomposeDiff.ts`: the station diff and the focusStage clamp.
3. **2D view follows the spec, not ad-hoc numbers.**
   - Positions come from `position2D` (`computeMetroLayout` / `fromJourney`), not `layer*260`.
   - Colours come from `PALETTE`; the critical path is 3 px.
   - `@xyflow/react` stays pinned at 12.12.0.
   - Keyboard, per frontend-spec, shared with `useSceneKeyboard`: ←/→ move between layers, ↑/↓ within a layer, Enter opens the drawer, Space toggles done.
   - The focused stage's column is highlighted and other columns are dimmed (§11.2 in 2D).
4. **Fact card scope.**
   - Show only facts the template uses: its rules, questions and repeat facts. There is no "Add fact from FACT_KEYS".
   - "Clear" sets a fact back to unknown.
   - The recompose toast names the stations: "Added: A, B · Removed: C", with at most 3 names each, then "+N more".
   - Done ids are keyed by composed id. A step that disappears keeps its done flag in the store and gets it back when it reappears.
   - If the focused stage is gone or empty after a recompose, `focusStage` becomes `currentStage()`.
5. **Persistence.**
   - `documentChecklist` goes into the persisted schema, `partialize` and `merge`.
   - Bump the persist version and add a migration test (older state loads with an empty checklist).
   - The checklist is never put in the share link.
6. **Layout with no page scroll at 1440×900 and 1280×800.**
   - The rail holds navigation plus "Your situation" (fact card, questions, not-needed list).
   - Rail width: 280 px at 1440 and above, 248 px at 1280.
   - Each section can collapse, and the rail scrolls internally (`overflow-y-auto`, `min-h-0`).
   - From 1024 to 1279 px, the rail collapses to icons, and "Your situation" opens as a sheet over the window.
   - Below 1024 px, the 2D view is the default, with the "Best on a laptop" note.
7. **Not-needed list.** "Change answer" focuses that fact's editor in the fact card. It never reverts the fact silently.
8. **Locked steps.** "Why is this locked?" is inline text in the drawer, not only a tooltip. It lists the unfinished prerequisites (titles) with their edge notes.

## Commits
- `feat(graph): drawer model, fact editors, 2D model, recompose diff (§8.6, §8.8)`, with tests
- `feat(shell): step drawer tabs with sources and review state (§8.8)`
- `feat(hud): your situation — fact card, questions, not needed (§8.6)`
- `feat(graph-2d): 2D view synced with 3D (frontend-spec "2D view")`
- `feat(shell): responsive rail and 2D default below 1024 px (§11.3)`

## Verify
- `npx -y npm@11.20.0 ci`, then `npm run verify`: green.
- No console errors except the THREE.Clock warning. No page scroll at 1440×900 and at 1280×800.
- Real data (`DATA_SOURCE=files`):
  - `start-business-mumbai`: open the drawer on SPICe+ and show all 4 tabs.
  - Toggle `business.serves_food`: FSSAI appears and disappears, and the toast names it.
  - Answer the top question.
  - `new-water-connection-mumbai`: first view, and drawer Source tab.
- Fixtures: `example-startup` and `stress-25-synthetic` in 2D.
  - Keyboard walk (←/→, ↑/↓, Enter, Space).
  - Mark done in 2D and switch to 3D: the same state shows.
- Width 1100 px: icon rail plus the "Your situation" sheet. Width 900 px: 2D default.
- Screenshots in `.next/claude-review/fe-4/`. **Look at each one before reporting.**

## Report
- The `npm ci` tail, and the `verify` tail with per-file counts.
- Screenshot paths.
- The recompose toast text from the `serves_food` toggle.
- The drawer text for one SPICe+ source, verbatim.
- The persist version before and after.
- Deviations: anything visibly wrong, with numbers.
- Follow-ups.

Then stop.
