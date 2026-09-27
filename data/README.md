# Civic Data Repository

This directory contains civic procedure datasets and test fixtures for DamnSon.

## Structure

- `fixtures/`: Test-only graph fixtures. Never imported in production application code paths.
  - `valid/`: Conforming, valid graph examples matching both JSON Schema 2020-12 and `analyzeGraph()` rules.
  - `invalid-schema/`: Malformed graph fixtures that fail both Ajv (JSON Schema) and Zod schema validation.
  - `invalid-graph/`: Schema-valid graphs that fail `analyzeGraph()` semantic integrity checks (cycles, broken references, inverted ranges, etc.).
- `seed/`: Production seed graphs. Stays empty until Milestone 1. Graphs placed here must be verified Mumbai procedures where every step is confirmed against an official government portal.
