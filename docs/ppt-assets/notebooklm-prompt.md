# Prompt 1 — NotebookLM source brief

## Sources to add to the notebook first

From `github.com/Gurpreet-pixel-hue/DamnSon`, branch `main`:

**Primary**
- `docs/prd/CivicWeave-PRD.md` — the single source of truth, v1.2. Product design, architecture, graph contract, API contracts, database, 48-hour plan, and the lane ownership in §13.2 / §15.2.
- `docs/ps.md` — the original problem statement (PSWB 02).
- `docs/techstack.md`, `docs/structure.md` — pinned versions, folder ownership.
- `docs/frontend-spec.md`, `docs/visual-direction.md` — Civic Metro visual parameters and the app shell.
- `docs/contract/approval-module.schema.json`, `docs/contract/journey-template.schema.json`, `docs/contract/facts.json` — the generated JSON Schemas for the graph contract.

**The real civic data — this is the evidence, not illustration**
- `data/seed/templates/start-business-mumbai.json` — the lead journey.
- `data/seed/modules/mca-spice-plus.json` — a representative approval module.
- `data/seed/modules/mcgm-new-water-connection.json` — the municipal journey, 11 steps.
- `data/sources/registry.json` — every official source, with manual captures for portals that block scripts.

**Screenshots of the running app** — `docs/ppt-assets/screenshots/`, captured from the real app serving
real verified data via `docs/ppt-assets/capture.mjs`, not mock-ups. `docs/ppt-assets/README.md` says what
each shot must show, which slide it belongs to and who owns it.

## What to produce

Act as a technical writer preparing the content for a **10-minute, 18-slide** hackathon presentation by
four final-year Computer Engineering students. Read every source and produce **one briefing document**
with the ten sections below.

Write tight. The deck has 16 content slides, so each section below must survive being cut to one or two
slides — lead with the sharpest version of each point and keep the supporting detail short enough for a
speaker to carry out loud.

1. **The problem, as a citizen experiences it.** Not "government is complicated" — the specific failure
   modes: hidden prerequisites, unknown ordering, the same document demanded repeatedly, repeat office
   visits, three tiers of government with different vocabulary and update cycles. Use the
   SaaS-company-in-Mumbai case study in PRD §3 and name the authorities actually involved.
2. **Why existing answers fail.** Search engines, blogs, paid agents, generic chatbots. Say precisely
   why a general-purpose LLM is unsafe here — invented fees, form numbers and URLs — and what the PRD
   does instead.
3. **What CivicWeave is**, in one paragraph a non-technical judge understands and one an engineer does.
4. **What is genuinely novel**, separated from what is merely well-executed. Cover: the dependency graph
   composed at runtime from reusable approval modules; three-valued logic, so an unknown fact shows
   "may apply" instead of vanishing; the three-part timeline (published SLA, conditional delay, derived
   dependency wait) instead of one "processing time"; "official" as a code-level predicate over
   `.gov.in` / `.nic.in`; the human verification gate; and derive-don't-store.
5. **The solution walked through**, following the demo script in PRD §15.6, compressed to four beats:
   say it in a sentence → see the route → open one step → change a fact and watch it rebuild.
6. **Technical architecture.** Three deployables, the request flow, the graph contract (modules,
   templates, composition, analysis), the database with immutability triggers and deny-by-default RLS,
   the AI service's retrieval and citation validation, and the degradation ladder in §6.6.
7. **Feasibility evidence**, drawn only from what the sources show: verified modules and steps, the test
   suite, the link check, the RLS verification. Separate **built and verified** from **designed but not
   yet running**.
8. **Challenges and how each was solved** — one per lane, with the engineering reasoning, not just the
   outcome. These must be short: they get one shared slide, four quadrants.
9. **Impact and benefits** for citizens, for municipal staff, and as a template for other cities.
   Include the honest limits.
10. **References** — every official source cited, grouped by authority, plus standards and tools. This
    becomes the final slide, so keep it to what will fit.

## Rules

- **Never invent a civic fact.** No fee, form number, timeline, threshold, address or URL that is not in
  a source. Where the data says "not verified" or "unknown", say so — that honesty is a feature of the
  project and should be presented as one.
- Distinguish **built and verified** from **designed but not yet running**. The web app, API, database,
  graph contract and verified data work; the AI service and production deployment are in progress. Do
  not present the latter as finished.
- Attribute work using PRD §13.2 and §15.2: **Gurpreet Sandhu** — all frontend; **Divvye Kansara** —
  platform and API; **Jai Kukreja** — AI service; **Pruthviraj Kachate** — data, verification and
  evaluation. The deck gives each person their own slides, so make it obvious which material belongs to
  whom.
- Quote exact numbers where the sources give them, and say where each came from.
