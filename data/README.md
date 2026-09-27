# Civic Data Repository

This directory contains civic procedure datasets and test fixtures for DamnSon.

## Structure

- `fixtures/`: Test-only graph fixtures. Never imported in production application code paths.
  - `valid/`: Conforming, valid graph examples matching both JSON Schema 2020-12 and `analyzeGraph()` rules.
  - `invalid-schema/`: Malformed graph fixtures that fail both Ajv (JSON Schema) and Zod schema validation.
  - `invalid-graph/`: Schema-valid graphs that fail `analyzeGraph()` semantic integrity checks (cycles, broken references, inverted ranges, etc.).
- `offices/`: Office lookup tables beside the seed (not part of the journey contract). `mcgm-ward-water-offices.json` holds MCGM ward Water Works office addresses and hours copied verbatim from each ward's RTI Section 4 manual; validated by `lib/graph/wardOffices.ts`. See `docs/adr/0002-mcgm-ward-office-dataset.md`.
- `seed/`: Production seed graphs. Stays empty until Milestone 1. Graphs placed here must be verified Mumbai procedures where every step is confirmed against an official government portal.
