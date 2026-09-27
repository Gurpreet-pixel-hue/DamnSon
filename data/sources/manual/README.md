# Manual text captures

Some official sites block automated requests (for example mca.gov.in answers every script with
"403 Access Denied"). For those pages the text is copied by hand from a browser into this folder,
so the copilot can still retrieve and cite it. PRD §9.2 (manual captures), §9.4 (text only, for citation).

## Rules

- Official pages only: the `url` must be https on .gov.in / .nic.in (same rule as `isOfficialUrl()`).
- Copy the text **verbatim** from the live page. Never edit, summarise, translate or add anything.
- Text only (`.md`). No PDFs, images or HTML.
- Only copy a page that is also listed in `../registry.json` with `"manualText"` pointing at this file.
- Re-check each file against the live page at H40 (DA-8) and update `retrievedOn`.

## File format

One file per page, named after the page (kebab-case), for example `mca-spice-plus-page.md`:

```markdown
---
url: https://www.mca.gov.in/content/mca/global/en/mca/e-filing/incorporation-change-services/spice.html
title: SPICe+
retrievedOn: 2026-09-26
capturedBy: Pruthviraj
excerpt: full
---

# <first heading on the page>

<text copied verbatim; keep the page's headings as markdown # / ## lines>
```

- `excerpt`: `full`, or the sections copied (for example `"Sections 1–2 and Chapter III"`) when a document is too long to copy whole.
- Headings as `#` lines let the ingester build `section_path`, just as it does for fetched HTML.
