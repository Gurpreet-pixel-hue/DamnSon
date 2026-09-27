FE-1V Stage 1 review round 2 (Part A), then the FE-3 plan (Part B). Branch: frontend.
Starting point: frontend = 2d756a0 (PR #22 open, don't merge it). main = e129422, which now contains PL-2 (#4): lib/server/journeys and /api/v1/templates*.
Read first: AGENTS.md, docs/visual-direction.md §3–§5, §7 and §8, PRD §8.8, §10.1, §10.3 and §11.

Your local npm is 11.6.2, but package.json requires ≥ 11.20.0. Run every install as `npx -y npm@11.20.0 …`. Never run plain `npm install`, because it rewrites the lockfile without the @emnapi entries.

Order:
1. Part A, then push.
2. Part B, plan only.
3. Send one report covering both, then stop.

# Part A · FE-1V round 2 fixes (G1–G7)

Review of 2d756a0 (clean `npm ci` with npm 11.20.0, `npm run verify`, dev server, Chromium renders at 1440×900 and 1280×800):
- Passed:
  - verify green (21 files / 141 tests);
  - debug numbers reproduce exactly: demo 23 / 57 / 225,361 / 389,519, stress 25 / 61 / 274,630 / 535,537;
  - only localhost requests;
  - the only console warning is THREE.Clock.
- Open: G1–G7 below.

## G1 · Pins must never cover label cards (high)
Today pins are `z-15` and cards `z-10` (components/canvas/labels/LabelLayer.tsx ~L202 and ~L271). Lock pins sit on top of card titles, for example "[Synthetic] 🔒 municipal entity registration".
- A station that has a card shows no separate pin. The card carries the state icon, and its leader stem points at the station.
- Pins are shown only for stations without a card.
- Cards and pins go through one collision pass in selectLabels.ts, which stays pure (it takes projected points and sizes):
  - a pin whose rect intersects a card rect is hidden;
  - cards are painted above pins, including when hovered or focused.
- Test in selectLabels.test.ts, for the demo and stress fixtures at 1440×900 and 1280×800 (use fixed projected points recorded from the default camera):
  - no pin rect intersects a card rect;
  - no two cards intersect.

## G2 · Default framing fills the viewport (high)
In the demo default view, the top 35 % of the screen is bare background and the journey is a thin strip.
- computeSafeFit frames the bounding box of the stations plus the stage headers, with an 8 % margin inside the safe area, not the whole board.
- Keep azimuth −15°. Lower the camera until the horizon and the board edge are outside the viewport in the default view. If needed, extend the board and city fill past the framed area so no bare background shows.
- Metric: in default.png at 1440×900 and 1280×800, at most 3 % of pixels are within ΔE 2 of `--cw-bg`. Compute this with sharp in art/tools/capture.mjs and print it.
- Tests in computeSafeFit.test.ts:
  - the station bounding box spans at least 70 % of the safe-area width for the demo;
  - it spans at least 60 % of the safe-area height for the stress graph.

## G3 · Stations must read above the city (medium)
The default view looks washed out, and the stations drown among same-sized fill buildings. In the reference the offices clearly dominate.
- Fog: `near = d * 1.8`, `far = d * 4.5` (d = camera-to-target distance).
- planCity, with both rules in planCity.test.ts:
  - no fill building in the plaza cell of any station or in the 8 cells around it;
  - fill buildings within 3 cells of a station are capped at 0.7 × that station's height.
- Stations render at 1.25× their current scale. They stay inside the §3 footprint (≤ 2.6 × 2.6, height ≤ 4.2); if needed, scale the city fill down to keep that ratio.
- Locked stations dim to no less than 60 % of their original luminance. They must still read as buildings.

## G4 · Selection keeps the scene visible (medium)
Opening a station today blurs the whole scene behind the Sheet, and the camera zooms so close that one building fills the screen.
- The step-details Sheet opens with no overlay and no backdrop blur: `modal={false}`, with no pointer blocking on the canvas.
  - The scene stays sharp and interactive.
  - Escape still closes the Sheet.
- Camera focus:
  - the selected station sits at the centre of the visible area left of the drawer;
  - it is about 25 % of viewport height;
  - at least its neighbouring stations stay in frame.
- In the drawer header, the "Placeholder" badge overlaps the close button. Move it left, into the title row.

## G5 · Labels on small graphs (medium)
visual-direction §4 says every station gets a label up to 16 stations. The demo shows 5 cards for 13 stations.
- When full cards collide, a card first falls back to compact form:
  - title only, one line, max 180 px, with an ellipsis;
  - the full title in `aria-label` and in a tooltip.
- A pin is the last resort, and only on graphs with more than 16 stations.
- Test: the demo fixture at 1440×900 gets 13 labels (full or compact) with no overlaps.

## G6 · Tooling hygiene (low)
- Remove the hard-coded `/Users/shridhartawate/.gemini/antigravity/brain/...` paths from art/tools/capture.mjs (L7) and art/blender/contact_sheet.py (L10). If extra copies are wanted, read an optional `REVIEW_EXTRA_DIR` environment variable.
- Read the Chrome path from `CHROME_BIN`, defaulting to the macOS app path.
- capture.mjs imports sharp, which only arrives transitively. Add `sharp` as an exact devDependency at the version already in package-lock.json.
  - The lockfile may change only in the root entry.
  - Prove it with `npx -y npm@11.20.0 ci` afterwards.
- Screenshots go to .next/claude-review/fe-1v/ as the FE-1V prompt says. art/out/review/ can stay as a local extra.

## G7 · Correct the PR #22 description (required before review)
The current body (and your last report) doesn't match the repo. Rewrite it with `gh pr edit 22 --body-file`:
- the assets are public/models/{stations,city,props}.glb with the atlas embedded, not "diorama.glb + atlas.png";
- the materials are lit, not "unlit";
- the sources are Kenney only; there are no Kay Lousberg or Quaternius assets;
- there is one 2048² PCF shadow map, not cascaded shadow maps;
- the budgets come from visual-direction §7 (not ≤ 65 / ≤ 80):
  - scene draws ≤ 36 (hard limit 50);
  - scene triangles ≤ 350k (hard limit 500k);
  - public/models + public/thumbs ≤ 6 MB;
- Deviations must list:
  - engines npm ≥ 11.20.0;
  - the new art/tools/ folder;
  - the debug overlay metrics;
  - the edits to docs/prompts and docs/visual-direction (land colour, PCFShadowMap);
  - the new top-level art/ folder as a PRD §6.2 addition.

## Part A verify
1. `npm run verify`: paste the tail, with test counts per file.
2. `npx -y npm@11.20.0 ci` succeeds on a clean clone.
3. Screenshots in .next/claude-review/fe-1v/:
   - default at 1440×900 and at 1280×800;
   - stress with ?debug=1;
   - a selected station with the drawer open;
   - reduced motion;
   - the side-by-side with the reference;
   - the G1 before/after pair.
4. Numbers verbatim:
   - demo and stress: scene draws, frame calls, scene triangles, frame triangles, fps;
   - the G2 background-pixel percentage at both sizes.
5. Console shows only the THREE.Clock warning. Network requests go to localhost only.

Commits, each citing its section:
- fix(canvas): pins and cards share one collision pass (visual-direction §4)
- fix(canvas): station-framed safe fit (§5)
- fix(canvas): station prominence and plaza clearing (§3)
- fix(hud): non-modal step drawer
- chore(art): portable capture tooling

Push frontend (PR #22 updates itself), then edit the PR body (G7). Don't merge. Also commit this prompt file with the first commit.

# Part B · FE-3 plan: journey page from the repository (plan only; wait for my approval)

FE-3 starts only after PR #22 is merged. It then begins with `git merge --ff-only origin/main` so that PL-2 is on frontend. Today, read PL-2 from origin/main (`git show origin/main:lib/server/journeys/index.ts` and similar) without merging it. Read node_modules/next/dist/docs for dynamic routes, async `params`/`searchParams`, `notFound()` and `loading.tsx` in Next 16 before you plan.

What FE-3 must deliver (PRD §10.1, §10.3, §11.2 `/journey/[taskId]`; visual-direction §8 row FE-3):
1. **Route `app/journey/[taskId]/page.tsx`**
   - It is a server component: it calls `getJourneyRepository().getPublishedJourney(taskId)` directly. It never fetches its own API over HTTP.
   - It parses the result with `publishedJourneyResponseSchema` and passes it to the client explorer.
   - The client composes the journey with `lib/graph/safeCompose` from the facts in `useTaskStore`. It sets `activeTaskId` from the route.
2. **States**
   - `loading.tsx` skeleton;
   - unknown id → `notFound()` with a link to the journey list;
   - composition or analysis error → the existing error state, with code + message;
   - "partially verified" banner when any composed action step is not `verified`, showing the count and "check the official source before acting";
   - success.
3. **Summary bar** (reference top strip). Every number comes from the lib/graph derivations. Nothing is invented; unknowns stay visible as unknowns.
   - **Next up:** `nextUpStepIds` titles. When there is more than one: "Do these in parallel".
   - **Estimated fee remaining** (`summarizeFees`): ₹ min–max (Intl en-IN). Add "+N fees to confirm" from `unconfirmedCount`, "may apply" amounts count toward max only, and `annual` fees are labelled "per year".
   - **Time remaining** (`summarizeTime`): min–max calendar days, "open-ended" when `openEnded`, the `relativeTo` wording from §8.8, and "+N steps with unknown time".
   - **Office visits:** count and distinct offices from `planOfficeTrips`. If an office name is unknown, show the department, never a made-up address.
   - The formatting lives in a pure helper, `lib/graph/summary.ts`, with tests: the zero, unknown, open-ended, annual and may-apply cases.
4. **Share Journey**
   - Use the existing `encodeShareState` / `decodeShareState` / `sanitizeShareState` in lib/graph/shareState.ts. Encode the URL exactly per §8.8: `/journey/<taskId>?task=<taskId>&f=<base64url facts>&done=<ids>`.
   - Copy it with the Clipboard API, and announce "Link copied" via `aria-live`.
   - On load:
     - decode (facts via `parseFacts()`) and drop ids that aren't in the composed journey;
     - if `task` doesn't match the path, ignore the params and show a toast;
     - if saved progress for this task differs, show a banner with "Replace with shared progress" or "Keep mine". Never overwrite silently.
5. **`/`**
   - Until FE-5 (landing + search), `/` becomes a minimal server-rendered list of published journeys from `listTemplates()`, each linking to `/journey/<taskId>`.
   - Delete `app/loadJourney.ts`. In dev fixtures mode, the fixture templates `demo-metro-synthetic`, `example-startup` and `stress-25-synthetic` are reachable at `/journey/<id>`.
   - Replace `?graph=broken` with a test of the error state. Keep `?debug=1`.
6. **Constraints**
   - Server components by default. 3D stays behind `next/dynamic(…, { ssr: false })`.
   - zod at the boundary.
   - No new dependencies.
   - components/canvas still consumes only MetroVM.
   - No edits in lib/contract, lib/server or app/api. If you need a change there, list it in the plan for Divvye.

The plan must include:
- files to create, change and delete;
- the server/client component split and the data flow, route → repository → client compose;
- the store changes;
- the share-state load algorithm, including the conflict banner;
- the summary-bar copy for every case in point 3;
- the tests you'll add;
- the screenshots you'll deliver:
  - `/`;
  - demo journey;
  - stress journey;
  - a 404;
  - the error state;
  - the partially-verified banner;
  - a shared-link conflict banner;
- risks and a time estimate;
- any place where the PRD, visual-direction or frontend-spec disagree, with options (a) follow the PRD, (b) change the PRD first, (c) a compliant alternative.

Real data note: data/seed on main is still empty. `start-business-mumbai` arrives when Pruthviraj's #8 lands on backend and backend is merged to main. Build and screenshot with `DATA_SOURCE=fixtures` (already in .env.local). Once the seed is on main, re-check with `DATA_SOURCE=files`.

# What comes after (context only; don't start any of it)

| Milestone | Scope | Depends on |
|---|---|---|
| FE-1V Stage 1 | this Part A, then I merge #22 | my review |
| FE-3 | journey page, summary bar, share (Part B) | #22 merged; PL-2 on main ✅ |
| FE-4 | fact card, decisive questions, step drawer (Overview / Documents / Fees / Source tabs, official source + verified date, Mark done + 8 s undo), not-needed list, 2D view | FE-3 |
| FE-5 | landing + search UI with location chip, lexical fallback when AI is down | PL-4 (#10, waiting on #9) |
| FE-6 | timeline, documents, source viewer, copilot panel, feedback, left navigation | PL-6 (#12), AI-4 |
| FE-7 | admin UI (modules table, step review sheet, publish with issues, audit) | PL-5 (#11) |
| FE-8 | performance, accessibility, polish; Stage 2 Blender hero landmarks; office trip map (P2) only if everything is green | FE-4 at least |

Everything runs locally first. There is no Vercel or cloud deploy until the full demo works on localhost.

# Report (one message)
- Part A:
  - the git start-of-session output;
  - the verify tail;
  - the `npm ci` tail;
  - all numbers verbatim;
  - the screenshot paths;
  - commits;
  - the PR #22 body after the edit;
  - deviations (every config or global-behaviour change counts);
  - follow-ups.
- Part B: the plan.
