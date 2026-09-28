# FE-4 fixes (PR #35)

Branch: `frontend`. Push to PR #35. Don't merge, don't force-push.

Review of cae24c3. I checked the code, your screenshots, and the Vercel preview built from this branch. The drawer model, the persist v3 migration, the recompose toast, the 404 layout and the 2D aria-labels are good.

**What's wrong:**
- `09-example-startup-2d.png` and `12-stress-synthetic-2d.png` are Next.js 404 pages (10,117 bytes each). The fixtures don't exist under `DATA_SOURCE=files`, so the 2D view was never captured, and the report described screenshots that don't show it.
- `01…04-start-business-spice-*` show the Form M step, not SPICe+.
- On real data, the 2D view opens zoomed out so far that no text is readable (25 nodes, one 12-node column).

## Fixes (one commit each)
1. `fix(graph-2d): frame the focused stage at a readable zoom`
   - On load and on every `focusStage` change, `fitView` to the focused stage's nodes plus their neighbours. Use `minZoom` 0.6, so node titles are ≥ 12 px on screen.
   - Pad the bottom by the measured stepper inset, so nothing sits under the stepper.
   - The "Whole route" button fits all nodes (zoom may go lower there).
   - Put `aria-label` on one element per node only. Today it appears on both the wrapper and the inner node, so screen readers read it twice.
2. `fix(hud): honest fee and time tiles`
   - When the fee tile's known range is 0–0 and any fee is still unconfirmed, show "To confirm" with "N fees to confirm" underneath, not "₹0".
   - Same for time: if the known range is 0–x and some durations are unknown, show "x+ days", not "0–x days", with "N unknown".
   - Pure helper in `lib/graph/summary.ts`, with tests for these cases.
3. `fix(hud): situation rail reads as a guide, not a form`
   - Order the rail: Key questions (top 3) first. Then "Your answers", showing only facts that are set, plus an "Edit all" button that expands every editable fact. Then "Not needed for you".
   - Show values as people read them: booleans as Yes/No; enum values with underscores turned into spaces and the first letter capitalised (`it_saas` → "It saas" is acceptable until the registry has labels); numbers as they are.
4. `fix(shell): drawer wording and toast placement`
   - "Office not specified" → "Office not verified".
   - "No documents required" → "No documents listed".
   - Remove the duplicated "Mandatory: Mandatory".
   - The undo and recompose toast sits above the legend and stepper, never on top of them.
5. `chore(art): capture FE-4 with the right data sources`
   - Capture the fixtures with `DATA_SOURCE=fixtures` (restart the server) and real journeys with `DATA_SOURCE=files`.
   - The SPICe+ screenshots must show the SPICe+ step.
   - Add 2D screenshots for start-business-mumbai (focused stage and whole route), example-startup and stress.
   - Before reporting, check every file's size and open it. A 404 or error page is a failed capture.

## Rules
- No new dependencies.
- Use explicit `git add <paths>`, never commit `docs/CivicWeave-Sprint-Plan.md`, and don't edit AGENTS.md or `lib/contract`.

## Verify
- `npm run verify`: green.
- No page scroll at 1440×900 and at 1280×800.
- Screenshots in `.next/claude-review/fe-4-fixes/`.

## Report
- The `verify` tail.
- The 2D zoom value, and the on-screen node title font size, for the focused stage on start-business-mumbai.
- The fee and time tile text on start-business-mumbai with no facts set.
- Screenshot paths with their file sizes.
- Deviations.

Then stop.
