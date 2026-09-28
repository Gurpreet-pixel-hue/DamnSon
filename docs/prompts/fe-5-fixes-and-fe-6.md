ROLE: You are Antigravity 2.0 working in /Users/shridhartawate/Documents/Projects/DamnSon on branch `frontend` (PR #38 is open to main; keep pushing to the same branch, the PR updates itself).
Before planning, read: AGENTS.md; docs/prd/CivicWeave-PRD.md (v1.3: "What changed in 1.3", §6.6, §8.8, §13); docs/visual-direction.md §9.2–§9.4, §11, §12; docs/prompts/sandbox-adoption-plan.md; this file. Commit this file as docs/prompts/fe-5-fixes-and-fe-6.md in your first commit (with docs/prompts/fe-4-fixes.md and docs/prompts/sandbox-adoption-plan.md, which are still untracked). Never commit docs/CivicWeave-Sprint-Plan.md or review/. Do not edit AGENTS.md or lib/contract/.

GOAL: Part A makes PR #38 mergeable and demo-safe (P0, do all of it first, in order). Part B builds FE-6 (rail panels) on top. Part C is evidence. Stop and report if you hit ERESOLVE, a contract change, or a PRD conflict; do not work around it.

======================================================================
PART A — FE-5 FIXES (P0, blocking the merge)
======================================================================

A1. Stage bar scrolls the 3D window sideways (seen live on the preview, root cause confirmed)
- components/canvas/StageBar.tsx:60 calls focusedPillRef.scrollIntoView({inline:"center"}). scrollIntoView scrolls EVERY scrollable ancestor, including the overflow-hidden canvas container in WindowCard. On start-business-mumbai after ←→ to stage 4 that container had scrollLeft=68: the canvas and the parallel tray slid 68 px under the left rail (tray text cut off: "pply for GST registration"), and a blank strip appeared on the right.
- Fix: never use scrollIntoView here. Scroll only the pill strip: `const strip = barRef.current; strip.scrollTo({ left: pill.offsetLeft - (strip.clientWidth - pill.offsetWidth)/2, behavior: reducedMotion ? "auto" : "smooth" })`.
- Guard: add a test (jsdom) that the canvas container's scrollLeft stays 0 after focusStage changes, AND in the capture script assert that every element under [data-testid="3d-window-card"] has scrollLeft===0 and scrollTop===0 after the stage-4 walk. The old "page scroll" check only looked at documentElement and missed this.

A2. Stage bar overlaps the tray and the drawer
- Measured live at 1440×900: stage bar x 422–1146, tray x 213–513 (after A1, 281–581). They overlap by about 90 px and both are z-30, so "Back to current step" sits on top of tray rows.
- Fix: centre the stage bar in the free area, not the card. Compute insets from the same values frameView uses (tray open → left inset 300 + 16; drawer open → right inset drawer width + 16), expose them from one helper (lib/graph or a hook in components/canvas) and use it for BOTH the camera frame and the stage bar position. Max width = free width − 32. Keep the bar height and pill sizes stable (no layout jitter).
- The recompose toast (07-whatif-toggle.png) and the ?debug=1 overlay also sit on top of the stage bar. Move the toast above the bar (bottom = bar top + 12 px) and the debug overlay to the top-left of the canvas.

A3. Keyboard hook hijacks keys (components/canvas/useSceneKeyboard.ts:32–76)
- Return early when e.ctrlKey || e.metaKey || e.altKey, or e.defaultPrevented, or e.isComposing. (Today Cmd/Ctrl+C jumps to the current stage and blocks copy; Alt+← browser Back is swallowed.)
- Enter and Space: skip when the target is a button, a, summary, [role=button], [role=radio], [role=checkbox], [role=switch], [role=tab], or [contenteditable]. Today Space on a focused guided-question chip marks a station done.
- Ignore all scene keys while any [aria-modal="true"] is open.
- KeysHintModal: role="dialog", aria-modal="true", aria-labelledby, focus moves in on open, focus trap, Esc closes, focus returns to the "? Keys" button.
- Tests: one per rule above (modifier, button target, modal open).

A4. 3D markers, ↑/↓ order and tray numbers disagree (§12.3)
- Stations.tsx:153 and useSceneKeyboard.ts:57 and :81 call buildStageTrayModel without `journey`, so modules sort alphabetically; the tray (WindowCard.tsx:203) passes `journey` and uses template order. Live: from a fresh stage 4, the first ↓ selected row 4.5 (EPFO), not 4.1.
- Fix: one memoised selector, e.g. `useStageTrayModel(stage)`, used by the tray, Stations (markers) and the keyboard. Pass journey and moduleTitles. Delete the hard-coded module titles in lib/graph/stageTray.ts:45–60 ("Bank Current Account", "Founder KYC" are not seed titles); titles come from data/seed modules only.
- Move the tray filter (All / Available / Online / In person) into useViewStore so ↑/↓ walks the filtered list.
- Marker atlas stops at 16 cells; station 17+ reuses cell 0. Generate the atlas for max(stationsInStage) (canvas texture, power-of-two, one draw call), or draw the number label from item.numberLabel.
- Test: for seed stage 4, the tray order, the marker numbers and the ↓ sequence are the same list.

A5. Tray content honesty (lib/graph/stageTray.ts)
- Line 81: a missing step returns "Free". Return "Fee: not verified".
- Lines 89–90: fees with recurrence "annual" must read "₹100 / year" (PRD §8.8).
- For may_apply rows, show the step's condition text from the seed (e.g. "Applies if: Annual turnover up to Rs. 1.5 Cr") in the row, muted. The three FSSAI tiers (registration / state licence / central licence) currently look like three things to do. Group consecutive rows that share a module and are all may_apply under a sub-header "One of these, depending on your situation". Derive this; store nothing. Do not invent a turnover question (there is no turnover fact in lib/contract/facts.ts; that is a contract PR for the backend lane, list it under Follow-ups).

A6. Remove invented "official" branding and the fake domain (AGENTS: never invent URLs)
- app/layout.tsx:7 falls back to https://civicweave.gov.in. Delete the fallback. Use NEXT_PUBLIC_SITE_URL, else VERCEL_PROJECT_PRODUCTION_URL (prefix https://), else http://localhost:3000. Add NEXT_PUBLIC_SITE_URL= to .env.example with a comment.
- app/journey/[taskId]/print/page.tsx:143 "Official Municipal Checklist" → "CivicWeave checklist · not an official document". :155 "Official Procedure" and "Rev 1" → remove, show "Data checked: <lastVerified date range from the steps>" if present, else nothing. :501 "civicweave.gov.in" → the site URL from above.
- Links on the print page: label each with isOfficialUrl() → "Official source" or "Other source". Never head a list "Official …" unless every link in it passes isOfficialUrl.
- Print footer adds one line: "Fees, forms and timelines change. Check each official source before you act."

A7. Print page correctness
- The TopBar "Print checklist" link drops the user's answers: the print page showed 25 steps while the journey showed 23. Link to /journey/<id>/print?<share params> using the same encoder as Share (lib/graph/shareState.ts), and have the print page compose with those facts and tick completed steps.
- Estimated fee reads "₹0 + ₹0–₹12,600/yr + 13 fees to confirm". Use deriveFeeTile/deriveTimeTile from lib/graph/summary.ts exactly like the top bar (e.g. "To confirm · 13 fees to confirm"). Never print "₹0 +".
- Official timeline "0–1 days" is wrong when 13 timelines are unknown. Use the honest tile ("x+ days · N unknown" or "To confirm").
- Unknown taskId must return a real 404 status. journey/[taskId]/loading.tsx wraps print/ and turns notFound() into a 200 (Next 16 streaming). Give print/ its own route segment behaviour: move the check before any Suspense boundary (e.g. print/layout.tsx that awaits getPublishedJourney and calls notFound(), the same pattern as the journey layout fix), and verify `curl -s -o /dev/null -w "%{http_code}" localhost:3000/journey/nope/print` prints 404.
- journey/[taskId]/not-found.tsx: wrap listTemplates in try/catch (render the page without the list on failure). OG image for an unknown id: return the generic site image, not "Civic Journey · 0 steps".

A8. Title suffix doubled
- Tabs read "Start a business in Mumbai | CivicWeave | CivicWeave". The root template adds the suffix; remove "| CivicWeave" from the journey, print and not-found titles.

A9. Landing search (components/landing/LandingSearch.tsx)
- "Map my route" overwrites saved answers (line 204 setFacts(targetTaskId, allFacts)). A user with saved progress who clicks Map my route without confirming anything loses their answers. Never write the store here. Navigate with the share params (facts only, no completed list), and let useShareJourney merge: new facts fill empty keys; a conflicting key shows the existing conflict banner. Test both paths.
- Validate the /api/v1/search response with searchResponseSchema (zod at boundaries). On parse failure show the error state.
- Add an AbortController: abort the previous request on every new search, and a 6 s client timeout (PRD 1.3 BFF budget). Ignore responses whose request id is not the latest.
- Do not reset confirmedFacts on a new search (location chip, retry). Reset dismissedSuggestions per query text.
- "affects 1 station" is hard-coded (line 92). Compute affectedStepCount with the same helper the rail uses (seed: entity type affects 12). Remove the `as FactDef["type"]` and `as FactKey` casts (types come from the registry).
- Confirmed facts are labelled "✓ Verified". In this product "verified" means an official source was checked. Rename to "✓ Confirmed by you".
- Each confirmed fact needs Edit (opens the FactInput inline) and Remove, as the PRD fact card requires ("confirm or edit").
- Evidence shows the whole sentence. Show only the matched span with 20 characters of context each side, the span highlighted (evidenceHighlight already does this).
- Show fact values with factDisplay option labels ("Food service / restaurant", "Private Limited"), never raw enums like "food service" in mono or "private limited".
- The offline notice says "(PRD §6.6)". Users must never see PRD references. Text: "Smart reading is offline, so we matched your words by keywords." Remove "PRD §" from every user-visible string in the app (grep for it; comments are fine).
- Remove `action="javascript:void(0)"` (React 19 rewrites it to a blocked URL). Keep onSubmit preventDefault; disable the Search button until hydrated (useSyncExternalStore or a mounted flag).
- Accessibility: <label> (visually hidden) for the query and location inputs; errors role="alert"; results region aria-live="polite"; match cards are <button> or radio group (keyboard can select option 2 and 3).
- suggestFacts "café" never matches (\b without the u flag). Use lookarounds with /iu: (?<![\p{L}\p{N}])…(?![\p{L}\p{N}]). Add tests for "café", "cafe", "Café".

A10. FactInput number stepper answers too early (components/hud/FactInput.tsx:126,134,158)
- On an unanswered integer question, "+" saves min immediately. Keep a local draft; only save on an explicit "Save" button or Enter. Show an empty field with placeholder "e.g. 2". Range from the registry (founders 1–10, employees 0–100000); show the range under the field.

A11. journeyDiff "×N" grouping never fires (lib/graph/journeyDiff.ts:21–42)
- Compose adds "(Director N)" to repeated titles, so no two match. Group by base step id (the id before the repeat suffix; use whatever composeJourney exposes, do not parse titles). Test: founders 1 → 3 gives "Prepare director identity details ×2" style grouped entries, not 4 separate lines.

A12. Intro (components/intro/IntroSequence.tsx), §9.2
- Reduced motion shows all words stacked on the wordmark (12-intro-reduced-motion.png: "CivicWeave" overprinted with four words and both paths). Render the reduced-motion frame as its own markup: brand mark + wordmark + tagline only, nothing else in the DOM.
- The animated path flashes the stacked state for one frame because gsap.set runs in useEffect after paint. Give every animated element an initial hidden style in CSS (opacity 0 / visibility hidden) and use useLayoutEffect (useIsomorphicLayoutEffect) for gsap.set.
- Total length: the timeline's onComplete always adds a 2 s hold with a pulsing bar. Target 3.5–4.5 s total. Hold only while the preload promise is still pending, capped at 1.5 s; clear the timeout on unmount.
- Do not import drei/three in the intro chunk (line 5 useGLTF). Preload the GLBs with <link rel="preload" as="fetch" crossOrigin="anonymous"> or a tiny fetch() warm-up, so repeat visits (sessionStorage says intro seen) do not download three.
- Check the sessionStorage flag before rendering anything (inline script in the landing page head, or the server reads a cookie set after the first view) so repeat visits never flash the intro or the blank beige frame (live: the first ~1 s is a blank screen with only "Skip intro").
- RGB-split text-shadow is permanent; make it a 2-frame hit per §9.2. After the intro, move focus to the search input.

A13. Entrance (components/canvas/entrance/*), §9.4
- useEntrance.ts:23–30 consumes arrivedFromLanding inside a useState initializer while CityBatches renders; CameraRig.tsx:215 reads it later in an effect and always sees false, so the camera entrance never plays. If CityBatches suspends, the initializer re-runs and the city rise is lost too.
- Fix: read the flag once at JourneyShell mount into a module-level entrance session { active, startedAt } (consumed exactly once), and let CameraRig, CityBatches, Tracks, Stations and LabelLayer read it via refs.
- setRouteProgress / setLabelsOpacity every frame re-render CityBatches ~60×/s. Use refs and mutate materials/uniforms directly in useFrame.
- Build the missing pieces: route draw (dash offset or drawRange from 0→1), station pop (scale 0→1 with a small overshoot, staggered in route order), label fade in last. Reduced motion or ?debug=1 → final state immediately.

A14. Shader warm-up (MetroScene.tsx:189–196)
- compileAsync starts after the first frame and nothing waits on it. Run it before the reveal: render the scene hidden (canvas opacity 0 / the loading overlay on top), await gl.compileAsync(scene, camera), then reveal. useThree() with no selector re-renders MetroScene on every store change; select only what you need.

A15. Stage 1 framing and the stage chip (seen in 03, 04, 06, 15 captures)
- "1 · START HERE" floats about 150 px above-left of its stations. Anchor the stage chip to the stage's station bounding box (top-centre, 24 px above the highest projected card), clamped to the window with the existing edge pinning.
- There is a small blue square in the top-right of the city in every capture (around x 1240, y 170 at 1440×900). Find what it is (a station marker from another stage, a prop, a stray plane) and remove it or give it its real material.

======================================================================
PART B — FE-6 RAIL PANELS (P0 after Part A; sandbox-adoption-plan.md #1, #4, #9, #10, #11)
======================================================================
B0. Panel system as overlays (#11)
- useViewStore.activePanel: "journey" | "visits" | "documents" | null (persisted in the existing view store; not in the task store).
- LeftRail gets icon buttons (with labels and aria-pressed) for My journey, Office visits, Documents. One panel at a time, 340 px, overlaying the LEFT edge of the 3D window (absolute, z above canvas, below the drawer). The canvas never resizes (§11.4 rule 5). The panel reports its width to the inset helper from A2, so frameView and the stage bar move over. When the parallel tray is open, the panel replaces it (tray collapses to its tab).
- Esc closes the panel and returns focus to its rail button. Panels are client components, loaded with next/dynamic(..., { ssr:false }) only if they touch window or three; otherwise normal client components.

B1. My journey panel (#10)
- "Personalised from your answers · N steps · X of N verified". Your answers (factDisplay labels, Edit opens the guided question). Totals via deriveFeeTile/deriveTimeTile (no ₹0). "Not needed for you" = the excluded list with the official reason. Progress: done / available / locked counts from deriveStepStates.

B2. Office visits panel (#1)
- In-person and hybrid steps grouped by office (department + office name from the seed), in journey order. Each visit: which steps it covers, what to carry (the union of those steps' documents with "used in N steps"), address and hours ONLY if the seed states them. Otherwise show "Where: per the official source" with the step text and the official link (isOfficialUrl label).
- Ward offices: data/offices/mcgm-ward-water-offices.json is NOT on main yet (Pruthviraj's PR #37 to backend). Do not copy it from the sandbox. Build the ward picker behind a prop that receives an optional validated dataset; with no dataset, hide the picker. Leave a TODO(FE-6b) naming PR #37.
- Clicking a step focuses it in the scene (same action as a tray row).

B3. Documents panel (#9)
- Grouped by the office that asks for them. "Needed now" (documents of available steps) vs "Later" (locked/may_apply). "Used in N steps". "You'll get this from <step>" when a document is an output of an earlier step (only if the seed states it). "N of M ready".
- Use the existing persisted documentChecklist[taskId][docKey] from useTaskStore (v3). Do not add a second store.

B4. Why this step (#4) in the drawer Overview
- Sandbox sources to port (read them with git show, never merge the branch): components/hud/OfficeVisitsPanel.tsx (B2), components/documents/DocumentChecklist.tsx (B3, UI only), components/hud/JourneySummaryCard.tsx (B1), components/hud/StepExplain.tsx and lib/graph/stepExplain.ts + stepExplain.test.ts (B4).
- Port lib/graph/stepExplain.ts (+ its test) from origin/sandbox/pruthviraj (git show origin/sandbox/pruthviraj:lib/graph/stepExplain.ts), adapting it to the current contract. Show: why it is on your map (applies / may_apply with the condition text / optional), what it depends on (required vs suggested order, edge notes), what it unlocks. Every item is a button that focuses that station. It replaces and extends "Why is this locked?".

B5. Copilot panel (P1, only if B0–B4 are done and green)
- PRD 1.3 row 3 / §7.4: a "Ask about this step" box in the drawer that POSTs /api/v1/copilot with { taskId, stepId, question }, 25 s client timeout with AbortController, shows answer + cited passages with source links, and the safe fallback ("Couldn't find this in the official sources" + top passages) on not_found/degraded. No personal data in the request (no facts values, no names). With the AI service offline on Vercel, the degraded state must look intentional.

======================================================================
PART C — EVIDENCE (the last report's captures did not show what they claimed)
======================================================================
Facts from the last run, so you understand why this part is strict:
- The capture script navigated with ?stage=4 and ?stage=all, but no code reads a `stage` param. "06-stage4-keyboard-walk.png" shows stage 1 with no tray. "15-…-whole" and "17-…-whole" show the stage view. The debug numbers for "stage" and "whole" were identical because they were the same view. The §11.6 whole-route budget was never measured.
- The keyboard log printed "step 1 … step 10" because its selectors (selected-station-title, focused-stage-chip) do not exist.
- The report said "maximum 50 scene draw calls"; §11.6 says ≤ 36. It said "Deviations: None".

Rules for this run:
C1. scripts/capture-overnight.mjs → rename to scripts/capture-review.mjs. Every capture step ASSERTS its state before the screenshot and aborts the run with a non-zero exit if the assert fails. Reach states by real input (click the whole-route toggle, press ArrowRight), never by URL params that the app does not read.
   Add these data attributes to the components first (they do not exist yet), then assert: focused stage number (data-focus-stage on the stage bar), whole-route (data-view-mode on the window card), tray open and selected row id (data-selected-row), panel open (data-active-panel), no ancestor of the canvas has scrollLeft/scrollTop ≠ 0, stage bar rect does not intersect tray/panel/drawer rects.
C2. The keyboard walk: from load, press ArrowRight until data-focus-stage=4, then ArrowDown 15 times (all stage-4 stations with no facts, 10 with the demo facts). Log per step: row id, row title, marker number read from the scene (window.__cwDebug.selectedMarker, exposed only when ?debug=1), camera distance. The three lists must match.
C3. Captures (1440×900, production build `npm run build && npm run start`, not next dev):
   01 landing with demo sentence + suggestions; 02 after confirming all + answering entity type; 03 entrance mid (≈600 ms after arrival); 04 entrance end; 05 stage 1 with nudge; 06 stage 4 tray + selection on row 4.3; 07 stage 4 tray filtered "In person"; 08 whole route (assert view mode); 09 what-if toast (toast above the bar); 10 My journey panel; 11 Office visits panel; 12 Documents panel; 13 drawer with Why this step; 14 print page with the demo facts (step count must equal the journey's); 15 intro beat 2; 16 intro reduced motion (must show ONLY brand + tagline); 17 branded 404; 18 1280×800 stage 4 with tray and drawer open (no overlap). Plus stress-25-synthetic stage view and whole view with debug overlay.
C4. Debug numbers verbatim for: seed stage 4, seed whole route, stress stage 1, stress whole route. Budgets from §11.6: scene ≤ 350k tris, frame ≤ 650k tris, ≤ 36 draw calls. If any number is over, say so under Deviations. Stage and whole numbers are expected to differ; if they don't, explain why with evidence.
C5. Open every PNG after writing it and describe in one line what is actually visible (not what was intended). Put sizes in the table. If two captures are visually the same view, the run is not done.
C6. Status codes: curl -s -o /dev/null -w "%{http_code}\n" for /, /journey/start-business-mumbai, /journey/nope, /journey/nope/print, /journey/start-business-mumbai/print, /api/v1/health. Paste output.
C7. Console: after the full capture run, dump window console errors collected by the script (every page). Only the THREE.Clock deprecation warning is allowed. Also report the "link preload but not used" warnings for the Geist fonts (seen live on the landing) and fix them if the font variable is not applied on that page.

======================================================================
VERIFY AND REPORT
======================================================================
- npx -y npm@11.20.0 ci; npm run verify (paste tails); push; wait for GitHub CI on PR #38 and paste the check names and conclusions.
- Conventional Commits, one per numbered item where sensible (A1…A15, B0…B5, C), each citing its PRD or visual-direction section. No force-push.
- Report sections: 1 verify tails; 2 table of items A1–A15, B0–B5 with Done/Partial/Not done and commit hashes; 3 keyboard walk log (C2); 4 debug numbers (C4); 5 status codes (C6); 6 capture table with the one-line "actually visible" description (C5); 7 decisions you made; 8 Deviations (anything you did differently from this prompt, any budget over, any item skipped; "None" is only acceptable if every item is Done and every assert passed); 9 follow-ups (include: turnover fact contract PR for FSSAI tiers; PR #37 ward data).
