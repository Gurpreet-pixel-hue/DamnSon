# Presentation assets

Everything the internal-hackathon slide deck pulls in. Kept in the repository so the deck can be
rebuilt from source, and so NotebookLM can be pointed at one folder.

## `screenshots/`

Captured from the running app, not mocked. Reproduce with:

```bash
DATA_SOURCE=files npm run dev          # serves the real verified seed data, no database needed
# then, in another shell:
node docs/ppt-assets/capture.mjs       # writes the files below
```

| File | What it must show | Slide | Owner |
|---|---|---|---|
| `01-landing.png` | Landing page: search box, popular journeys | Solution walkthrough | Gurpreet |
| `02-journey-3d.png` | Civic Metro 3D: stations laid out by dependency layer, tracks, the city | Solution, Technical | Gurpreet |
| `03-journey-2d.png` | The same map drawn flat (React Flow) — proves 2D/3D parity | Accessibility, Feasibility | Gurpreet |
| `04-step-drawer.png` | A step open: authority, documents, fee, timeline, **official link**, verification badge | Uniqueness (traceability) | Gurpreet |
| `05-summary-bar.png` | Fees remaining, time remaining, office visits, progress | Impact | Gurpreet |
| `06-fssai-flip.png` | Before/after changing business type to food — the FSSAI branch appearing | Uniqueness (live recomposition) | Gurpreet + Pruthviraj |
| `07-not-verified.png` | A field showing "not verified" instead of an invented value | Uniqueness (honesty) | Pruthviraj |
| `08-admin-review.png` | Admin step review: field beside its source, verify / flag | Solution (human gate) | Gurpreet + Divvye |
| `09-api-health.png` | `GET /api/v1/health` JSON, and one journey response | Technical | Divvye |
| `10-rls-denied.png` | Terminal: publishable key returns `[]` while the database holds rows | Technical (security) | Divvye |
| `11-copilot-citation.png` | A cited copilot answer with its `[1]` marker and official badge | Uniqueness, AI | Jai |
| `12-link-check.png` | `node data/tools/check-links.mjs` output | Feasibility (real data) | Pruthviraj |

Anything that cannot be captured yet (because the milestone is not built) should be left out of the
deck rather than mocked up.

## `diagrams/`

Export each Mermaid diagram from the slide-deck prompt to PNG or SVG here, so the deck does not depend
on a live renderer. `docs/reference/civic-metro-target.jpg` is the visual direction reference.
