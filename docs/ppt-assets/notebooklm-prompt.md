# Prompt 1 — NotebookLM source brief

## Sources to add to the notebook first

From the repository `github.com/Gurpreet-pixel-hue/DamnSon` (branch `main`):

**Primary (add all of these):**
- `docs/prd/CivicWeave-PRD.md` — the single source of truth, v1.2. Product design, architecture, graph contract, API contracts, database, 48-hour plan.
- `docs/ps.md` — the original problem statement (PSWB 02).
- `docs/techstack.md`, `docs/structure.md` — pinned versions and folder ownership.
- `docs/frontend-spec.md`, `docs/visual-direction.md`, `docs/frontend-structure.md` — Civic Metro visual parameters and the app shell.
- `docs/contract/approval-module.schema.json`, `docs/contract/journey-template.schema.json`, `docs/contract/facts.json` — the generated JSON Schemas for the graph contract.
- `docs/adr/0001-node-26-locally.md` — a worked example of the change-control process.

**Real civic data (add at least these three, they are the evidence):**
- `data/seed/templates/start-business-mumbai.json` — the lead journey.
- `data/seed/modules/mca-spice-plus.json` — a representative approval module.
- `data/seed/modules/mcgm-new-water-connection.json` — the municipal journey, 11 steps.
- `data/sources/registry.json` — every official source, with manual captures.

**Screenshots of the running app** — `docs/ppt-assets/screenshots/`. These are captured from the real
app serving real verified data (`docs/ppt-assets/capture.mjs`), not mock-ups. `docs/ppt-assets/README.md`
lists what each one shows, which slide it belongs to and who owns it.

## What to produce

Act as a technical writer preparing a briefing for a 10-minute hackathon presentation by four
final-year Computer Engineering students. Read every source and produce **one structured briefing
document** with the sections below. Write in plain, concrete language. Prefer specifics from the
sources over general claims.

1. **The problem, as a citizen experiences it.** Not "government is complicated" — the specific
   failure modes: hidden prerequisites, unknown ordering, duplicate document submission, repeat office
   visits, information scattered across central, state and municipal portals with different vocabulary
   and update cycles. Use the SaaS-company-in-Mumbai case study in PRD §3 as the worked example, and
   name the actual authorities involved.
2. **Why existing answers fail.** Search engines, blogs, agents, and generic chatbots. Explain
   precisely why a general-purpose LLM is unsafe here (invented fees, form numbers and URLs) and what
   the PRD does instead.
3. **What CivicWeave is**, in one paragraph a non-technical judge would understand, then in one
   paragraph an engineer would.
4. **What is genuinely novel**, separated from what is merely well-executed. Cover: the dependency
   graph composed at runtime from reusable approval modules; three-valued logic so an unknown fact
   shows "may apply" instead of silently disappearing; the three-part timeline (published SLA,
   conditional delay, derived dependency wait) rather than one "processing time" number; "official"
   being a code-level predicate over `.gov.in`/`.nic.in`; the human verification gate before anything
   reaches a citizen; and derive-don't-store (status, order, layers, positions and totals are all
   computed).
5. **The solution, walked through end to end**, following the nine-stage demo script in PRD §15.6.
6. **Technical architecture.** The three deployables, the request flow, the graph contract (modules,
   templates, composition, analysis), the database with its immutability triggers and deny-by-default
   RLS, the AI service's retrieval and citation validation, and the degradation ladder in §6.6.
7. **Feasibility evidence.** Draw only on what the sources actually show: number of verified modules
   and steps, the test suite, the link check, the RLS verification. Distinguish clearly between what is
   built and verified, and what is designed but not yet running.
8. **Challenges and how each was solved**, with the engineering reasoning, not just the outcome.
9. **Impact and benefits**, for citizens, for municipal staff, and as a template for other cities.
10. **References** — every official source cited, plus the standards and tools used.

## Rules

- **Never invent a civic fact.** No fee, form number, timeline, threshold, address or URL that is not in
  a source. Where the data says "not verified" or "unknown", say so — that honesty is a feature of the
  project and should be presented as one.
- Distinguish **built and verified** from **designed but not yet running**. As of the hackathon, the
  web app, API, database, graph contract and verified data are working; the AI service and the
  production deployment are in progress. Do not present the latter as finished.
- Attribute work to the right person using the lane ownership in PRD §13.2 and §15.2:
  Gurpreet Sandhu — all frontend; Divvye Kansara — platform and API; Jai Kukreja — AI service;
  Pruthviraj Kachate — data, verification and evaluation.
- Quote exact numbers where the sources give them, and say where each came from.
