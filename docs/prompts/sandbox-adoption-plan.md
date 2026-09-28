# Sandbox branch adoption plan (`sandbox/pruthviraj`, 70f3431)

Reviewed 2026-09-28.
- The branch is a single "try" commit on top of main `d3dea52`. That base is before FE-3.5 (stage focus, calm city) and FE-4 (drawer, rail, 2D).
- Its own tests (4 files, 20 tests) and eslint pass.
- **The branch is not merged as it is.** Its shell, rail and drawer edits predate FE-3.5 and FE-4 and would undo them.
- Features are ported one by one into FE-5 and FE-6 on top of the current `frontend`.

## Decision per feature
| # | Sandbox feature | Files | Verdict | Where |
|---|---|---|---|---|
| 1 | **Office visits**: the in-person/hybrid steps grouped by office, in journey order. Each visit shows what it covers and what to carry. Address and hours appear only when the data states them. Where no single office exists, it shows "Where, per the official source" (the step text and source link) | `components/hud/OfficeVisitsPanel.tsx` | **Adopt** | FE-6 "Office visits" rail panel |
| 2 | **MCGM ward offices**: 7 ward Water Works offices (A, D, H/East, K/West, L, P/South, R/Central). Addresses are copied verbatim from each ward's official AEWW RTI manual; 2 include hours, 3 have a map check. A ward picker fills the address for `ward_office` steps | `data/offices/mcgm-ward-water-offices.json`, `components/hud/wardOffices.ts` | **Adopt, through the data lane** | Pruthviraj opens a data PR to backend. It needs a zod schema in `lib/graph/wardOffices.ts`, a test, link-checker coverage and a short ADR (a new dataset, Class B). FE-6 consumes it |
| 3 | Embedded Google map (iframe, no key) for wards whose pin was checked | `wardOffices.ts` `mapsEmbedUrl` | **Defer** | FE-8, P2, which already needs the map-provider decision. The embed needs a CSP `frame-src` change and loads third-party content. Keep "Open in Google Maps" links now |
| 4 | **Why this step**: why it's on your map (reasons), what it depends on (required vs suggested order, with edge notes), what it unlocks. Every item is clickable | `lib/graph/stepExplain.ts` (+ test), `components/hud/StepExplain.tsx` | **Adopt** | FE-6: a drawer Overview block that replaces and extends "Why is this locked?" |
| 5 | **Better journey diff**: repeated stations grouped by title ("KYC ×2"), "now applies" for may-apply → applies, and the removal reason from `excluded` | `lib/graph/journeyDiff.ts` (+ test) | **Adopt** (upgrades FE-4 `recomposeDiff`) | FE-5 |
| 6 | **What if**: change an answer and see which stations appear or disappear, with the official reason, and how the totals changed (before → after) | `WhatIfPanel.tsx`, `totalsChange.ts` | **Adopt** | FE-5. Demo moment: "serves food → +3 FSSAI stations, fee range changes" |
| 7 | **Guided questions**: one decisive question at a time, "affects N stations", skip and "show skipped", then hand off to What if | `GuidedQuestions.tsx`, `FactInput.tsx` | **Adopt** as the questions UX | FE-5, both the landing flow (§9.3) and the rail |
| 8 | **Readable fact values** from the template question's option labels (fallback Yes/No, en-IN numbers) | `components/hud/factDisplay.ts` | **Adopt now** | FE-4 fixes add-on (replaces the "It saas" fallback) |
| 9 | **Documents checklist page**: grouped by office, "needed now / later" from step states, "used in N steps", "you'll get this from …", "N of M ready" | `components/documents/DocumentChecklist.tsx` | **Adopt the UI, not its store** | FE-6 "Documents" rail panel. Use FE-4's persisted `documentChecklist[taskId][docKey]` (v3). Drop the sandbox's `documentsHeldByTask`, which would be a second store for the same thing |
| 10 | **Journey summary card**: "Personalised from your answers · N steps · X of N verified", your answers, totals, not needed | `JourneySummaryCard.tsx` | **Adopt partly** | FE-6 "My journey" panel. Totals text must use FE-4's honest tiles (no ₹0) |
| 11 | **Docked panel system**: rail icons open one 340 px panel next to the window | `JourneyPanels.tsx`, rail and `useViewStore.activePanel` | **Adopt the idea, change the layout** | FE-6. Panels overlay the left edge of the 3D window. Docking beside it resizes the canvas, which breaks §11.4 rule 5 (the same fix we made for the drawer) |
| 12 | Change toast with `role="status"` and `aria-live="polite"` | `ChangeToast.tsx` | **Adopt the a11y bit** | FE-5: the recompose toast becomes a live region |
| 13 | Sandbox edits to `JourneyShell`, `LeftRail`, `RightDrawer` and the stores | | **Don't take** | Predates FE-3.5 and FE-4 |

## Milestone placement
- **FE-4 fixes (now):** #8.
- **FE-5** (landing search + fact card + questions, PRD 1.2 §9.3; needs PL-4):
  - #7 guided questions (landing and rail);
  - #5 diff;
  - #6 what-if with totals delta;
  - #12 live-region toast.
- **FE-6** (rail panels):
  - My journey (#10);
  - Office visits (#1 + #2 data);
  - Documents (#9);
  - Why this step in the drawer (#4);
  - the panel system as overlays (#11);
  - then the copilot, timeline, sources and feedback already planned.
- **FE-8:** the map embed (#3), after the map-provider and CSP decision.
