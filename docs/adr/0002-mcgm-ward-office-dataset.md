# ADR 0002 — MCGM ward Water Works office dataset

- Status: proposed
- Date: 2026-09-28
- Class: B (new dataset, §13.3)

## Context

The new water connection journey is applied for "in your ward" (MCGM ward office), but the seed
contract has one step for all 24 wards, so it cannot say which office a citizen goes to. Office
addresses must never be invented (§13.1). Each ward's Assistant Engineer (Water Works) publishes an
RTI Section 4 manual on the MCGM portal that states the office address and office timings.

## Decision

Add `data/offices/mcgm-ward-water-offices.json`: one entry per ward with `ward`, `office`, `address`,
`hours`, optional `mapCheckedOn` and `source` (the ward's manual). It is a lookup table beside the
seed, not part of the journey contract, so `lib/contract` does not change.

- `address` and `hours` are copied verbatim from the manual's address and "Tel. No. & office timings"
  entries (whitespace normalised). Each was re-checked against the downloaded manual on 2026-09-28.
  One text-extraction artefact was not copied: a page number inside "(Monday to 6 Friday)" in the
  K/West manual. The A Ward manual itself says "08.00am to 12.00 a.m on Saturdays"; it is kept
  verbatim, since correcting it would be our guess.
- `mapCheckedOn` is set only where the Google Maps pin for the address was checked by eye (D, H/East,
  K/West). For A, L, P/South and R/Central Google placed the pin wrongly or not at all, so the field
  is omitted.
- No coordinates are stored. The UI links to a Google Maps search for the verbatim address.
- `lib/graph/wardOffices.ts` holds the zod schema (strict objects, official source URL, unique wards)
  and `WARD_OFFICES`, validated at import. `lib/graph/wardOffices.test.ts` parses the committed file
  and checks that every manual is also cited by `mcgm-new-water-connection`.
- `data/tools/check-links.mjs` now also reads `source.url` from `data/offices/**/*.json`.

## Consequences

- Only 7 of 24 wards are covered (A, D, H/East, K/West, L, P/South, R/Central). Other wards show
  "Not verified" until their manuals are added.
- Manuals can go stale; `retrievedOn` records the capture date and the link checker flags dead links.
- The embedded map waits for FE-8; this dataset only enables the "Open in Google Maps" link.
- `data/offices/**` is not yet in the §13.2 ownership table. It belongs with the data lane
  (Pruthviraj, PR to `backend`); the table is updated in the next PRD change to `main`.
