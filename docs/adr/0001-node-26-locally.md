# ADR 0001 — Building on Node 26 locally, against the Node 24 LTS pin

- Status: accepted
- Date: 2026-09-27
- Class: B (recorded deviation, §13.3)

## Context

§13.4 pins **Node.js 24 LTS** (minimum 22.12). The platform lane's machine has **Node 26.0.0**
installed, and `package.json` declares `"engines": { "node": ">=22.12.0" }`, which 26 satisfies.
CI (`.github/workflows/ci.yml`) and Vercel both build on **Node 24**, so this affects one developer's
machine, not what ships.

## Decision

Develop on Node 26 locally rather than spend hackathon time reinstalling the toolchain. `.nvmrc` stays
at `24` so everyone else, CI and Vercel stay on the pinned version.

## Consequences

- A behaviour difference between Node 26 and 24 would show up in CI rather than locally. Everything in
  this lane so far is covered by tests that CI runs on Node 24.
- If a local-only failure ever appears that CI cannot reproduce, the Node version is the first suspect.
- Revisit after the hackathon: either move to Node 24 locally or raise the pin deliberately, once
  Node 26 is an LTS release.
