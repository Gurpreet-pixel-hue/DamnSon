---
trigger: glob
globs: "lib/graph/**, data/**, app/api/**"
description: "Rules for the civic task graph contract, its validation and the API boundary."
---

# Graph contract rules

- `docs/graph-data-schema.json` is the contract and `lib/graph/schema.ts` mirrors it in zod. Change both in the same commit, update the fixtures and tests, and bump `schemaVersion` on any breaking change.
- JSON Schema cannot express graph integrity, so `analyzeGraph()` enforces unique step ids and edge ids, edges that reference existing steps, no self-loops, no duplicate `from → to` pairs, no cycles, `min ≤ max` for fee and time ranges, and at least one official source on every verified step. Errors reject the graph; warnings (no official source, unofficial source) render with a visible flag.
- Order is deterministic: Kahn's algorithm with ties broken by the order steps appear in `nodes`.
- Layers: a step with no prerequisites is in layer 0; otherwise its layer is 1 + the maximum layer of its prerequisites. Steps in the same layer can be done in parallel.
- These values are derived and never stored in graph data: user status (locked / available / in progress / done), step order, layers, 2D/3D positions, fee totals, total duration, critical path.
- Fees: totals add fixed and range fees only. Variable and unknown fees are listed separately; never guess an amount.
- API route handlers validate every input with zod (400 on failure) and never return raw errors or stack traces.
- Admin writes replace a whole graph (`PUT`) and re-run `analyzeGraph()` on it, because a single-step edit can create a cycle. Write routes stay disabled (501) until admin auth exists (Milestone 5).
- Real graphs go in `data/seed/` only when every step is verified against an official source. `data/fixtures/` is test-only.
