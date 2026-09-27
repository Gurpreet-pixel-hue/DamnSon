FE-2 · M1.3 · Move the UI logic to contract v3. Branch: frontend.

This file has two steps: A, which ships FE-1, and B, the FE-2 task itself.

Read first: AGENTS.md, PRD §8 (especially §8.5–8.9), Appendix D.7, §10.3 and §11.1.

State of the repo:
- main contains the baseline (#2) and contract v3 (#3, lib/contract/**).
- PL-2, the read API (#4), is not merged yet.
- frontend has 6 local, unpushed commits: FE-1, the docs, and FE-1.1.

## Step A · Ship FE-1 (small: no plan needed; do it first and report)

1. Sync
   - Clean tree check, then: git fetch origin --prune && git merge --no-edit origin/main. It is a normal merge and must not conflict; if it does, abort and report.
   - Then run npm ci. The lockfile changed on main (#3 added @emnapi/*, tsx).
   - Run npm --version and paste the output (it must be 11.x).

2. Label fix (carried over from FE-1.1). LabelProjector only recomputes when the camera, the canvas size or the MetroVM changes. So when the label selection changes without the camera moving, the slots are stale:
   - focusing a station with ← / → hides the next-up label;
   - after a camera flight, a label is left drawn at the top-left corner (0,0).
   Fix:
   - LabelLayer computes the selection once (useMemo) and shares that exact array with LabelProjector through a ref.
   - LabelProjector treats a new array identity as dirty, just like a camera change.
   - In the same frame, write the transform before setting visibility to visible. Hide every slot whose index is at or beyond the selection length.
   - No React state per frame, no allocations in useFrame.
   - Browser check at 1440×900:
     - press ArrowRight twice without moving the camera: the next-up label is still visible within 60 px of its station's projected position;
     - select a station: when the camera flight ends, no visible label sits at the viewport's top-left corner unless its station projects there.
     - Report both checks with the measured positions.

3. npm run verify must be green; report the test counts per file. Expect 20 files, including lib/contract/*.

4. Push and open the PR.
   - Commit: `fix(canvas): label projector refreshes on selection change`.
   - git push origin frontend.
   - gh pr create --base main --head frontend --title "FE-1: Civic Metro 3D on view models (+ review fixes)". The body must include:
     - a summary;
     - the verify tail;
     - the stress numbers (scene draws / frame calls / fps);
     - the screenshot paths;
     - the known follow-up: the visual upgrade is FE-1V.
   - Don't merge it.
   - Leave art/ untracked; FE-1V commits it.
   - Report: git log --oneline --graph -10, and the PR URL.

## Step B · FE-2: contract v3 (plan first: phases 0–6, then wait for my approval)

Phase 0 · Sync
- Step A already merged main.
- Never edit lib/contract/**. If something there looks wrong, stop and tell me.
- Commit locally. Push only after I confirm the FE-1 PR is merged, so it stays reviewable.

Phase 1 · Derivations on ComposedJourney (lib/graph, one module each, co-located tests)
- progress.ts: deriveStepStates(journey, completed) → Map<id, "done" | "available" | "locked">, and nextUpStepIds(journey, states). Rules (§8.8):
  - done if the id is in completed;
  - available if every requires prerequisite is done or may_apply;
  - otherwise locked;
  - recommended_after never locks.
  - Milestones are never in completed. A milestone is done when every requires prerequisite that isn't may_apply is done; otherwise it's locked.
  - Evaluate in analyzeJourney order.
  - nextUp = the available, non-optional steps, in that order.
- totals.ts: summarizeFees(journey, completed) → { minINR, maxINR, unconfirmedCount, mayApplyCount } and summarizeTime(journey, completed) → { minDays, maxDays, openEnded, unknownCount, criticalStepIds, relativeTo, relative? }. Rules (§8.8), with these details pinned down by the tests:
  - totals skip done, optional and milestone steps. Milestones contribute 0 days but stay in the graph.
  - toCalendarDays(d, "working") = ceil(d × 7 / 5).
  - Fees:
    - fixed and range add to min and max for applies steps, and to max only for may_apply steps;
    - variable and unknown add 1 to unconfirmedCount;
    - every not-done may_apply step adds 1 to mayApplyCount.
  - Durations per not-done action step:
    - sla gives [min, max];
    - no_fixed_sla gives [0, 0] and sets openEnded;
    - unknown gives 0 and adds 1 to unknownCount.
  - Conditional timelines:
    - rule false → ignored;
    - open_ended → sets openEnded;
    - otherwise add their max to max, and their min to min only when the rule is true (no rule counts as unknown).
  - may_apply steps count 0 toward min.
  - The path:
    - optional steps are left out entirely; done steps and milestones stay on it with 0 duration.
    - Walk steps in analyzeJourney order. finish = (the largest finish min, the largest finish max, any openEnded) over the step's requires prerequisites, plus the step's own duration.
    - minDays = the largest finish min, maxDays = the largest finish max, openEnded = any finish open-ended.
  - criticalStepIds: start from the step with the largest finish max, then repeatedly step back to the requires prerequisite with the largest finish max. Ties go to the earlier step in analyzeJourney order.
  - relativeTo: the last not-done no_fixed_sla step on the critical path, else null.
  - When relativeTo is set, relative = summarizeTime with relativeTo and all its ancestors added to completed (keep only minDays, maxDays, openEnded). Otherwise relative is absent.
- documents.ts (new): buildDocumentChecklist(journey, completed) → entries in first-appearance order (analyze order) over applies and may_apply action steps that aren't done. Each entry: { key, label, usedIn: stepIds, producedBy: other steps whose outputs include the documentTypeId }. The label is the document name, plus " (" + personLabel + ")" for per-person documents.
- trips.ts: planOfficeTrips(journey) uses the M1 rules: non-online, non-optional action steps grouped by office.name ?? department, in analyze order. may_apply steps are included with a flag.
- layout.ts: computeMetroLayout(journey) uses the M1 rules with analyzeJourney layers and a barycenter over all incoming edges. Milestones sit on the ground (y = 0).
- shareState.ts:
  - encode { taskId, facts, completed } → task=<id>&f=<base64url(JSON of facts with keys sorted)>&done=<ids sorted, comma-joined>, via URLSearchParams;
  - decode with zod + parseFacts, dropping malformed parts;
  - sanitize(state, journey) drops ids that aren't in the journey.
- viewModel.ts: replace fromV2 with fromJourney(journey, completed).
  - Positions come from computeMetroLayout and states from deriveStepStates.
  - kind, applicability and badge ("×?" when repeatCountUnknown) come straight from the composed steps.
  - Tracks carry the edge kind. A track is critical when from and to are consecutive entries of criticalStepIds. It is dashed for recommended_after, or when either end is may_apply or optional.
  - [B2] Delete the local OfficeType union and import OfficeType from @/lib/contract/schema. Its OFFICE_TYPES has the same 12 values.
  - Keep the StationVM/TrackVM/MetroVM shapes unchanged: components/canvas and labels/selectLabels must not need edits beyond imports.

Phase 2 · Exact expectations
- Fixture: data/fixtures/v3, template example-startup, facts A = {"business.sector":"it_saas","company.founders_count":2,"employees.count":5}.
- Use full composed ids in tests. Load fixtures with data/fixtures/v3/loadFixture.ts, which is test-only (ESLint enforces that).
- analyzeJourney order: ex-directors.kyc.1, ex-directors.kyc.2, ex-incorporation.file, ex-incorporation.incorporated, ex-banking.open-account, ex-food.apply, ex-recognition.apply, ex-local.intimation, ex-local.display
- States and nextUp:
  - completed none → kyc.1 and kyc.2 available, all others locked; nextUp [ex-directors.kyc.1, ex-directors.kyc.2]
  - completed {kyc.1, kyc.2} → file available, the rest of the unfinished steps locked; nextUp [ex-incorporation.file]
  - completed {kyc.1, kyc.2, file} → ex-incorporation.incorporated done (milestone); open-account, food.apply, recognition.apply and intimation available; display locked; nextUp [ex-banking.open-account, ex-food.apply, ex-local.intimation]
- summarizeFees:
  - none → { minINR: 500, maxINR: 1500, unconfirmedCount: 2, mayApplyCount: 1 }
  - {kyc.1, kyc.2, file} → { minINR: 0, maxINR: 0, unconfirmedCount: 2, mayApplyCount: 1 }
- summarizeTime (criticalStepIds in all three cases: [ex-directors.kyc.1, ex-incorporation.file, ex-incorporation.incorporated, ex-food.apply]):
  - none → { minDays: 2, maxDays: 9, openEnded: true, unknownCount: 2, relativeTo: "ex-incorporation.file", relative: { minDays: 2, maxDays: 7, openEnded: true } }
  - {kyc.1, kyc.2} → { minDays: 2, maxDays: 7, openEnded: true, unknownCount: 2, relativeTo: "ex-incorporation.file", relative: { minDays: 2, maxDays: 7, openEnded: true } }
  - {kyc.1, kyc.2, file} → { minDays: 2, maxDays: 7, openEnded: true, unknownCount: 2, relativeTo: null } (no relative)
- computeMetroLayout (position3D · position2D):
  - ex-directors.kyc.1 [0, 2.2, -2.25] · {x: 0, y: -70}
  - ex-directors.kyc.2 [0, 2.2, 2.25] · {x: 0, y: 70}
  - ex-incorporation.file [7, 2.2, 0] · {x: 280, y: 0}
  - ex-incorporation.incorporated [14, 0, 0] · {x: 560, y: 0}
  - ex-banking.open-account [21, 0, -4.5] · {x: 840, y: -140}
  - ex-food.apply [21, 2.2, 0] · {x: 840, y: 0}
  - ex-local.intimation [21, 2.2, 4.5] · {x: 840, y: 140}
  - ex-recognition.apply [28, 2.2, -2.25] · {x: 1120, y: -70}
  - ex-local.display [28, 0, 2.25] · {x: 1120, y: 70}
- buildDocumentChecklist, none done (key · label · usedIn · producedBy):
  1. pan-card-individual · "PAN card" · [kyc.1, kyc.2] · []
  2. office-address-proof · "Registered office address proof" · [file] · []
  3. pan-card-individual#1 · "PAN card (Founder 1)" · [file] · []
  4. pan-card-individual#2 · "PAN card (Founder 2)" · [file] · []
  5. certificate-of-incorporation · "Certificate of Incorporation" · [ex-banking.open-account] · [ex-incorporation.file]
  (ex-recognition.apply is optional, so it's not in the checklist.)
- encodeShareState({ taskId: "example-startup", facts: A, completed: ["ex-incorporation.file", "ex-directors.kyc.1"] }) →
  task=example-startup&f=eyJidXNpbmVzcy5zZWN0b3IiOiJpdF9zYWFzIiwiY29tcGFueS5mb3VuZGVyc19jb3VudCI6MiwiZW1wbG95ZWVzLmNvdW50Ijo1fQ&done=ex-directors.kyc.1%2Cex-incorporation.file
  Decoding it round-trips, and sanitize drops "ghost.step".

Phase 3 · Stores v2 (lib/store/useTaskStore.ts)
- State: activeTaskId, factsByTask: Record<taskId, Facts>, completedByTask: Record<taskId, string[]>, selectedStepId.
- Actions: setFact(taskId, key, value), clearFact(taskId, key), setFacts(taskId, facts), toggleStepDone(taskId, id) (a no-op for milestones), selectStep.
- persist:
  - name "damnson-progress-v2", version 2, partialize to factsByTask + completedByTask, skipHydration.
  - Persisted data is validated with zod in both migrate and merge (facts through parseFacts, .catch({}) per field), with no casts.
  - v1 data is discarded.
- Tests: corrupted storage rehydrates to {} without throwing; valid storage round-trips; toggling a milestone does nothing.
- [B3] ProgressTracker (FE-1.1) and useSceneKeyboard read the v2 store fields. Update them to the new store shape.

Phase 4 · Remove v2
- Delete:
  - lib/graph/schema.ts, lib/graph/analyzeGraph.ts, lib/graph/resolvePath.ts;
  - lib/data/** (the v2 repository and search);
  - app/api/search-path/** (Divvye's /api/v1/search replaces it);
  - app/api/admin/graphs/** (a v2 stub; Divvye's /api/v1/admin replaces it);
  - data/fixtures/{valid,invalid-schema,invalid-graph,demo,stress}/**;
  - docs/graph-data-schema.json and docs/examples/ (superseded by docs/contract/);
  - their tests.
- The v2 admin UI (components/admin/**) goes too. app/admin/page.tsx becomes a placeholder until FE-7.
- lib/graph/officialSources.ts is the re-export PL-1 left "until M1.3". Point every import at @/lib/contract/officialSources and delete it (PRD D.6).
- [B1] app/loadGraph.ts (FE-1) depends on lib/data and data/fixtures/stress. Phase 6 replaces it.

Phase 5 · Synthetic v3 demo data
- Port the v2 demo and stress graphs to v3 in data/fixtures/v3/modules and data/fixtures/v3/templates, next to PL-1's files.
  - Never edit the ex-* modules or example-startup; their tests depend on them.
  - Module ids start with demo- or stress-.
- Template demo-metro-synthetic: 4–5 modules, 12–14 steps, at least 8 officeTypes, all three modes, a milestone, a non-government step, a repeated step, may_apply and optional steps, and a recommended_after link.
- Template stress-25-synthetic: 25 steps, all 12 officeTypes plus one milestone, about 40 edges over 7 layers.
- Titles start with [Synthetic] and departments with Example. Sources are only https://www.india.gov.in/ or https://example.com/…. Reviews are mixed.
- Both pass analyzeTemplate.
- Test: every answer combination of the demo's questions composes ok, with unique positions.

Phase 6 · Rewire ExplorerShell to v3
- PL-2 (#4) isn't merged. Replace app/loadGraph.ts with a small development-only server loader in app/:
  - it reads the two JSON templates plus their pinned modules from data/fixtures/v3 with fs (read by path, never imported: ESLint forbids fixture imports outside tests);
  - it parses them with zod and checks them with analyzeTemplate;
  - DATA_SOURCE=fixtures is required, and a production build refuses it.
- The client composes with facts from the store: composeJourney → analyzeJourney → fromJourney.
- /?graph=stress loads stress-25-synthetic, in development only.
- Keep the FE-1 empty state when no data is available. List "switch to lib/server/journeys after PL-2" as a follow-up.
- [B4] Leave art/, the FE-1V prompt and the visual direction alone. FE-2 changes data flow, not looks.

Verify
1. npm run verify with test counts per file.
2. A dev-server screenshot of the demo in 3D and the stress graph with ?debug=1: scene draws, frame calls, fps. Also confirm there are no console errors.
3. `git grep -n "resolvePath\|CivicTaskGraph\|search-path" -- app components lib` prints nothing (the docs still mention them on purpose).

Commits:
- `refactor(graph): derivations on contract v3 (§8.8)`
- `feat(store): facts and progress v2 (§10.3)`
- `chore: remove the v2 contract and data (§8.9)`
- `test: synthetic v3 demo and stress templates`
- `feat(explorer): compose journeys from v3 fixtures (§11.1)`

Report: the verify tail, test counts, the grep output, screenshots and numbers, deviations (every config or global-behaviour change counts) and follow-ups. Paste all evidence exactly as the commands printed it.
