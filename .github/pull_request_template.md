## Summary

<!-- What changed and why, in a few lines. -->

## PRD sections

<!-- e.g. §8.5, §10.1, Appendix D.7. Every plan, commit and PR cites them (PRD "Instructions for AI agents"). -->

## Screenshots

<!-- Required for UI work. A browser check with no console errors is part of "done" (§13.2);
     the only harmless warning is `THREE.Clock: This module has been deprecated`. Delete this section for backend-only PRs. -->

## Test evidence

<!-- Paste real command output, never a summary of it (§13.2). -->

```
npm run verify
```

- [ ] `npm run verify` green
- [ ] `npm run validate:seed` green (if `data/` changed)
- [ ] `make lint typecheck test` green (if `services/intelligence/` changed)
- [ ] Stayed inside my lane's folders (§13.2); anything else is listed as a follow-up
- [ ] No invented civic data: every fee, timeline and threshold cites an official source, or says "not verified"
- [ ] No secrets; `.env*` still untracked
