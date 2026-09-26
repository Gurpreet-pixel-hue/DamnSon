---
description: Run the full quality gate (lint, typecheck, tests, production build) and report the results
---

1. Run `npm run lint`.
2. Run `npm run typecheck`.
3. Run `npm run test`.
4. Run `npm run build`.
5. If a step fails, fix the cause within the current task's scope and rerun from step 1. Never disable rules, skip tests or loosen `tsconfig` to get green.
6. Report pass/fail for each step with the last lines of its output. If a fix is out of scope, stop and explain what is needed.
