# DamnSon — Municipal Bureaucracy Path Visualizer

Internal Hackathon 2026-27 · PSWB 02 (Web Based Category)

Describe a civic task in plain language, such as *"register a cloud kitchen in Bandra"*, and see the whole procedure as an interactive roadmap: every step, office, form, fee and timeline, the order they happen in (including which steps run in parallel), and a link to the official government source for each one. You can track your progress, and an admin dashboard keeps the data verified.

## Docs

- [Problem statement & requirements](docs/ps.md)
- [Tech stack & rules](docs/techstack.md)
- [Repository structure & milestones](docs/structure.md)
- [Graph data contract](docs/graph-data-schema.json) · [example](docs/examples/example-graph.json)
- Agent rules for Antigravity: [AGENTS.md](AGENTS.md), [.agents/](.agents)

## Branches

- `main`: reviewed, working state only (merge via pull request)
- `frontend`: UI work
- Later milestones use short-lived feature branches off `main`

## Run locally

Requires Node.js 24 LTS (minimum 22.12).

```bash
npm install
npm run dev      # http://localhost:3000
npm run verify   # lint + typecheck + tests + production build
```
