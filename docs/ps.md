> Superseded where it differs by docs/prd/CivicWeave-PRD.md (v1.1). docs/frontend-spec.md stays normative for Civic Metro parameters.

# Problem Statement — PSWB 02: Municipal Bureaucracy Path Visualizer

**Source:** *PS Internal Hackathon 2026* (Computer Engineering Department, Internal Hackathon 2026-27), Web Based Category, ID PSWB 02.

## What the PS asks for

Users describe a civic task (for example *"register a small business"*). The tool scrapes and aggregates fragmented government websites and auto-generates a visual, step-by-step dependency graph of forms, offices and prerequisites, because that information is usually scattered across dozens of disconnected government pages.

Expected solution: a web-based **Civic Task Navigator**. Users enter a task in natural language together with details such as location and type of service. The system gathers information from official government websites and extracts the required forms, documents, departments, offices, eligibility criteria, fees, prerequisites and application links. It identifies the dependencies between them and presents an interactive, step-by-step visual roadmap showing what to do, in what order and where. Each step links to its official source for verification, users can track completed tasks and monitor progress, and an administrative dashboard lets the team review, validate and update the extracted information.

## Requirements traced to the PS

| # | Requirement from the PS | How we meet it |
|---|---|---|
| R1 | Natural-language task input, plus location and type of service | HUD search bar with location and category filters → `POST /api/search-path` |
| R2 | Gather information from official government websites and extract forms, documents, departments, offices, eligibility criteria, fees, prerequisites and application links | Extraction pipeline (Milestone 5) that fills the graph contract: `forms`, `documents`, `department`, `office` / `officeType`, `eligibility`, `fee`, `edges`, `sources` |
| R3 | Identify dependencies; interactive step-by-step roadmap showing what, in what order and where | `analyzeGraph()` computes the order and the parallel layers → 3D spatial view and 2D flowchart |
| R4 | Every step links to its official government source for verification | `sources[]` per step, checked by `isOfficialUrl()`; unofficial or missing sources are shown explicitly |
| R5 | Users mark completed tasks and monitor progress | Progress store persisted in localStorage; remaining steps, fees and time are derived |
| R6 | Admin dashboard to review, validate and update extracted data | `/admin`: per-step review status; every save re-validates the whole graph |

## Our additions (design decisions, not PS mandates)

- A 3D spatial view with an instant toggle to a 2D flowchart. The 2D view is also the accessible and no-WebGL fallback.
- Search autocomplete and suggested common workflows (from each graph's `keywords`).
- Processing timelines, accepted document formats, and fee totals. Variable or unknown fees are listed separately and never guessed.
- Conditional and optional steps (e.g. a fire NOC that is needed only above an area threshold).
- An explicit **unverified** label on anything an admin has not verified.

## Definitions

- **Official source (India):** an `https` URL whose host ends in `.gov.in` or `.nic.in`, or a host on a manually vetted exception list. The PS says ".gov pages"; Indian portals use `.gov.in` / `.nic.in`, so code must never test for a bare `.gov`.
- **Verified graph:** every step has `review.status = "verified"` and at least one official source.

## Demo scope

Two or three fully verified Mumbai procedures (for example a cloud kitchen in Bandra, a water meter transfer, a shop and establishment registration) beat a dozen unverified ones, because judges will click the official links.
