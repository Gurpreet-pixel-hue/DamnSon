---
trigger: glob
globs: "lib/graph/**, data/**, app/api/**"
description: "Rules for the civic task graph contract, its validation and the API boundary."
---

# Graph contract rules

- The contract is `lib/contract` (PRD §8, App. D) and is strictly read-only outside a PR to `main` reviewed by both frontend and backend leads.
- Validate with zod schemas and `analyzeModule` / `analyzeTemplate` / `analyzeJourney` before render, save or publish.
- Personalisation is `composeJourney(template, modules, facts)`: conditional modules and steps activate according to facts; unanswered questions remain as `may_apply`.
- Order, layers, user step states, totals, 2D/3D positions and the critical path are derived and never stored in graph data.
- Fees: totals add fixed and range fees only. Variable and unknown fees are listed separately; fees never guess amounts.
- API route handlers validate every input with zod and return the Appendix F error envelope.
- `data/seed` holds real verified data only. Every fact keeps its source URL, authority, title, and retrieval date.
- `data/fixtures` is synthetic and test-only, except the development loader with `DATA_SOURCE=fixtures` (never in production).
