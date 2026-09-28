# Overnight run: logic fixes, FE-4.5 stage navigation, FE-5 landing and natural-language search, demo polish

You run unattended. Gurpreet is asleep.
- **Don't ask questions.** Make the reasonable choice, write it under "Decisions I made" in the report, and continue.
- **Stop only if `npm run verify` is red and you can't fix it within that part.** Then commit nothing broken, report, and stop.
- Work **in the order below**. P0 before P1. Commit after every numbered item, so partial progress is usable.

## Setup
1. `git fetch origin --prune && git checkout frontend && git merge --ff-only origin/main && git log --oneline -3`.
   - main includes PR #35 (FE-4) and PR #34 (PRD 1.3).
   - The merge must fast-forward; if it doesn't, stop and report.
2. `npx -y npm@11.20.0 ci`.
3. Commit the uncommitted docs unchanged: `docs/visual-direction.md` (§12) and `docs/prompts/fe-4.5-stage-navigation.md`, plus this file as `docs/prompts/overnight-fe-4.5-fe-5.md`. Message: `docs: §12 stage navigation and overnight prompt`.
4. **Screenshots never go in `.next/`**, because `next build` wipes it. Save them in `review/overnight/`, and add `review/` to `.git/info/exclude` (a local-only ignore, not committed).

Read first: AGENTS.md; PRD §6.6, §8.6, §8.8 (1.3), §9.1 and F.1 (search response); `docs/visual-direction.md` §9.2–9.5, §11, §12; `docs/prompts/fe-4.5-stage-navigation.md`; the branch `origin/sandbox/pruthviraj` (read only, for ports).

---

## Part A: logic fixes on real data (P0)
With no facts, almost every start-business-mumbai step is `may_apply`. So "Company incorporated" shows as done and the journey opens on stage 5.

- **A1 `fix(graph): milestone done only after a prerequisite is done (PRD 1.3 §8.8)`**
  - In `lib/graph/progress.ts`, a milestone is `done` when every non-`may_apply` `requires` prerequisite is done **and at least one `requires` prerequisite is done**.
  - Test: the real start-business-mumbai journey (from `data/seed`) with `{}` facts gives "Company incorporated" as `locked`.
  - Existing tests keep passing, or are updated with a comment citing 1.3.
- **A2 `fix(graph): current stage counts may-apply steps (§11.1)`**
  - `currentStage()` becomes the lowest layer with an `available` step whose applicability is `applies` **or `may_apply`** (never optional-only).
  - Test: start-business-mumbai with `{}` gives stage 1.
  - Also update the §11.1 wording in `docs/visual-direction.md`.
- **A3 `feat(hud): personalise-first nudge`**
  - When the top decisive question is unanswered and at least half the stations are `may_apply`, show one compact line above the stage bar: "Most steps depend on 1 answer: <question text>", with its options as buttons.
  - Answering sets the fact. It dismisses for the session.

## Part B: FE-4.5 stage navigation (P0)
Execute `docs/prompts/fe-4.5-stage-navigation.md` fully (§12.1–12.4): keyboard map, always-visible stage bar, parallel stage tray with numbered markers, route declutter.
- Use its commit list, tests and verification.
- The stage-4 keyboard walk runs on start-business-mumbai with `DATA_SOURCE=files`, after Part A.

## Part C: FE-5 landing and natural-language search (P0; `docs/visual-direction.md` §9.3)
- **C1 `feat(landing): natural-language search on / (§9.3)`**
  - `/` becomes the landing:
    - small wordmark at the top left;
    - "What do you need to get done?";
    - an input at least 64 px tall;
    - the location chip;
    - the "Map my route" button;
    - example chips that are the **titles of published templates** (from `listTemplates`), never invented.
  - Submit calls `POST /api/v1/search` (F.1). Then:
    - the input docks to the top;
    - the fact card shows each fact with the **query words it came from highlighted** (from `evidence`);
    - the location chip is filled from `jurisdiction`, editable, and never assumed. `clarifications` of kind `location` become chips;
    - `matches`: one match shows a route card; more than one shows up to 3 choice cards ("Best match" on the first);
    - notices `no_match`, `location_required` and `out_of_scope` each get a friendly state with the examples;
    - `mode: "lexical_fallback"` shows "Smart reading is offline; matched by keywords" (PRD §6.6).
  - Loading state: skeleton lines. Hard errors: an inline retry. Keyboard: Enter submits, Esc clears.
  - Pure helpers in `lib/landing/*.ts` with tests: evidence highlighting (overlaps, case-insensitive, Devanagari-safe) and match selection.
- **C2 `feat(landing): suggested answers from your words (approved by Gurpreet)`**
  - Only when `mode` is `lexical_fallback`, or the AI returned no facts: `lib/landing/suggestFacts.ts` scans the query against a **curated keyword table**. It returns `{fact, value, evidence}` suggestions.
  - Values must exist in `lib/contract/facts.ts` (enum values, integer min/max), and the fact must be used by the matched template.
  - The table:

    | Words in the query | Suggested fact |
    |---|---|
    | "private limited", "pvt ltd", "pvt. ltd." | `business.entity_type=private_limited` |
    | "one person company", "opc" | `business.entity_type=opc` |
    | "llp" | `business.entity_type=llp` |
    | "restaurant", "cloud kitchen", "cafe", "café", "food", "bakery", "catering", "dhaba", "tiffin" | `business.serves_food=true` and `business.sector=food_service` |
    | "saas", "software", "app", "it company", "tech startup" | `business.sector=it_saas` |
    | "shop", "store", "retail" | `business.sector=retail` |
    | "factory", "manufactur…" | `business.sector=manufacturing` |
    | `(\d+)\s*(employees|staff|people|workers)` | `employees.count` |
    | `(\d+)\s*(founders|directors|partners|co-founders)` | `company.founders_count` |
    | "trademark", "brand name" | `intent.trademark=true` |
    | "gst" | `intent.gst_now=true` |
    | "udyam", "msme" | `intent.udyam=true` |
    | "dpiit", "startup india", "startup recognition" | `intent.dpiit=true` |
    | "export", "import" | `business.imports_or_exports=true` |

    Match on word boundaries. Hindi and Marathi words are welcome only where you are sure of them; otherwise skip them.
  - UI: a "Suggested from your words" chip row, each chip with its highlighted evidence and ✓ Confirm / × Dismiss. **Nothing is applied until confirmed.**
  - Tests: "open a cloud kitchen in Andheri with 5 employees" gives `serves_food=true`, `sector=food_service` and `employees.count=5`, and no `entity_type`. "2 founders pvt ltd" gives `founders_count=2` and `entity_type=private_limited`. "shop" alone suggests nothing for `serves_food`.
- **C3 `feat(hud): guided questions (port from sandbox)`**
  - Port `GuidedQuestions.tsx` and `FactInput.tsx` from `origin/sandbox/pruthviraj`, adapted to current tokens and stores: one question at a time, "affects N stations", skip, and "show skipped".
  - Use it on the landing after search, and in the rail's Key Questions.
  - Values display through the FE-4 `formatFactValue`.
- **C4 `feat(graph): richer change summary and what-if (port from sandbox)`**
  - Port `lib/graph/journeyDiff.ts` with its test (grouping "×N", "now applies", removal reason from `excluded`). It replaces FE-4's `recomposeDiff`; keep the focusStage clamp.
  - Port `WhatIfPanel` + `totalsChange`: a "What if…" section under "Your answers" in the rail, with the before → after of the four tiles (honest tile text).
  - The recompose toast becomes `role="status"` `aria-live="polite"`.
- **C5 `feat(landing): map my route`**
  - "Map my route" navigates to `/journey/<taskId>` in the PRD §8.8 share format, carrying the confirmed facts and location. The journey page must hydrate those facts.
  - Test the round trip on start-business-mumbai: facts from the landing show in "Your answers", and FSSAI stations are present when `serves_food=true`.
- **C6 `feat(landing): continue card and published journeys (P1)`**
  - If saved progress exists: "Continue: <title> · N of M done", which opens the journey.
  - Below the fold: a grid of published journeys (title, summary, step count, "X of Y verified" from `listTemplates`).

## Part D: FE-5 intro and entrance (P1; §9.2, §9.4)
- **D0.** Add **exactly** `gsap@3.15.0`: `npx -y npm@11.20.0 install gsap@3.15.0 --save-exact`. This is the only new dependency allowed; the PRD 1.2 stack approves it. Commit the lockfile with it.
- **D1 `feat(intro): kinetic intro with preload (§9.2)`**
  - Build exactly the §9.2 storyboard, safety rules, reduced-motion path, sessionStorage key and skip behaviour.
  - Preload the 3D chunk and GLBs, and show the slow-load progress line.
- **D2 `feat(canvas): landing → journey entrance (§9.4)`**
  - Build exactly §9.4: the city rise, station pops, route draw and label fade.
  - Skipped on reload, deep link, `?debug=1` and reduced motion. No new draw calls.
- **D3 `perf(canvas): shader warm-up before reveal`**: `gl.compileAsync(scene, camera)` before the first visible frame, plus a branded journey skeleton in `loading.tsx`.

## Part E: demo polish (P1)
- **E1** A branded `not-found.tsx` (app level and journey level) and a branded error page. Today the 404 is Next's default black page. Include a link home and the published journeys.
- **E2** Metadata:
  - per-page titles and descriptions;
  - an SVG favicon from the brand mark;
  - `app/opengraph-image.tsx` and `app/journey/[taskId]/opengraph-image.tsx` via `next/og`, showing the journey title, "N steps · X of Y verified" and the wordmark. Read the Next 16 docs in `node_modules/next/dist/docs` first.
- **E3** A print checklist at `/journey/[taskId]/print` (frontend-spec "Checklist page"):
  - steps in topological order with checkboxes, documents, fees, offices and **official URLs printed in full**;
  - a light print stylesheet;
  - a "Print checklist" button in the drawer footer menu or the top bar.
- **E4** Empty and edge states: water connection (no questions) says "Same for everyone", and zero office visits reads correctly.

## Rules
- The only new dependency is `gsap@3.15.0`. Run every install as `npx -y npm@11.20.0 …`.
- Use explicit `git add <paths>`, never commit `docs/CivicWeave-Sprint-Plan.md` or `review/`, and don't edit AGENTS.md or `lib/contract`.
- Never invent text, fees, addresses or dates. Missing means "not verified".
- §11.6 budgets hold. No allocations in `useFrame`. The canvas never resizes on panel open.
- Each part keeps `npm run verify` green before moving on.

## Verify (at the end, then report)
- `npx -y npm@11.20.0 ci`, then `npm run verify`: green.
- No console errors except the THREE.Clock warning.
- No page scroll at 1440×900 and at 1280×800 on `/` and on `/journey/start-business-mumbai`.
- Real GPU, `DATA_SOURCE=files`:
  1. **Landing:** type "I want to open a cloud kitchen in Andheri with 5 employees", then submit (lexical mode is fine). Capture the suggestions and the evidence highlighting. Confirm them, "Map my route", and capture the entrance mid-way and at its end.
  2. **Journey:** the first view opens at stage 1, and "Company incorporated" is locked. Show the personalise-first nudge. Answer entity type, then capture.
  3. **Stage 4:** run the full keyboard walk from the FE-4.5 prompt and include its log.
  4. **What if:** toggle `serves_food`. Capture the toast and the what-if before → after.
  5. **Print page:** capture.
  6. **Intro:** 3 frames (b2, b6, b9) and the reduced-motion frame.
  7. **404:** capture the branded page.
- Fixtures (`DATA_SOURCE=fixtures`): example-startup and stress-25-synthetic, stage view and whole route.
- Save everything in `review/overnight/`. **Open every image before reporting.** A 404, error or blank capture is a failure; fix it and recapture.

## Push and PR
- Push `frontend`. Open **one** PR `frontend → main` titled "FE-4.5 + FE-5: stage navigation, landing, natural-language search". Its body lists the parts and commits. Don't merge.
- If you stopped early, push what's green and say where you stopped.

## Report (one message)
- The `npm ci` tail, and the `verify` tail with per-file test counts.
- Per part: done / partial / not started, with the commits.
- The keyboard-walk log for stage 4.
- The landing results for the demo sentence: the search `mode`, the suggestions with their evidence, the facts after confirming, and the stations on the journey.
- Debug overlay numbers verbatim (stage view and whole route) for start-business-mumbai, example-startup and stress.
- Screenshot paths with file sizes.
- **Decisions I made** (every judgment call).
- **Deviations** (anything visibly wrong, with numbers).
- Follow-ups.
