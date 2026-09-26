# CivicWeave (DamnSon): Municipal Bureaucracy Path Visualizer (PSWB 02)

The single source of truth is docs/prd/CivicWeave-PRD.md (v1.1). Read "What changed in 1.1",
§13 (engineering rules and folder ownership) and the sections for your task before planning.
docs/frontend-spec.md holds the Civic Metro visual parameters.

- If a request conflicts with the PRD, stop and ask: name the PRD section and offer
  (a) follow the PRD, (b) change the PRD first, (c) a compliant alternative. Never deviate silently.
- Build P0 before P1 and P1 before P2 (PRD §2.2). Later items are not built.
- Never invent fees, forms, timelines, thresholds, addresses or URLs. Show "not verified" instead.
- Stay in your lane's folders (PRD §13.2). lib/contract and docs/contract change only by PR to main,
  reviewed by one frontend and one backend person.
- Git: long-lived branches are main, frontend, backend. Never commit to main directly. No force-push.
  Conventional Commits. Cite PRD sections. Evidence in reports is pasted verbatim from real runs.
- Never commit secrets (.env* untracked, only .env.example). The Supabase secret key is never deployed.
- Versions are pinned exactly (PRD §13.4): three 0.186.x, React < 19.4, TypeScript 5.x, ESLint 9.x,
  Prisma 7.10.x. Never --force or --legacy-peer-deps; on ERESOLVE stop and report.
- TypeScript strict + noUncheckedIndexedAccess; no any, no @ts-ignore, no hiding casts; zod at boundaries.
- Server components by default; three/R3F, React Flow, window, storage = client components loaded with
  next/dynamic(..., { ssr: false }). lib/server files start with import "server-only".
- Folders: components/ui = shadcn only; hud, canvas (3D), graph-2d, admin; lib/contract shared contract;
  lib/graph UI derivations (pure TS); lib/store zustand; lib/server backend; services/intelligence Python.
- Graph data passes zod + the matching analyze*() before render, save or publish. Status, order, layers,
  positions and totals are derived, never stored. Official = isOfficialUrl() (.gov.in/.nic.in/vetted).
- Real data only in data/seed; fixtures in data/fixtures are test-only. No personal data to LLMs.
- Python: 3.12, mypy --strict, ruff; LLM calls only via llm/router.py; prompts only in prompts/.
- Every 3D interaction has a 2D/keyboard equivalent; respect prefers-reduced-motion.
- Done = npm run verify (and make lint typecheck test) green + browser check with no console errors
  (only the THREE.Clock deprecation warning is allowed) + screenshots for UI work.
- Next.js 16 differs from older versions (proxy.ts, Turbopack, next typegen): read
  node_modules/next/dist/docs/ before framework code.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
