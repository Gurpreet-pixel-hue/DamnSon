"use client";

import React, { useMemo, useState } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import { planOfficeTrips } from "@/lib/graph/trips";
import { deriveStepStates } from "@/lib/graph/progress";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { WARD_OFFICES, mapsEmbedUrl, mapsSearchUrl } from "./wardOffices";

export interface OfficeVisitsPanelProps {
  journey: ComposedJourney;
  completed: ReadonlySet<string>;
}

const STATE_TEXT = { done: "Done", available: "Can do now", locked: "Locked" } as const;
const STATE_CLASS = {
  done: "bg-[var(--cw-done)]/10 text-[var(--cw-done)]",
  available: "bg-[var(--cw-available)]/10 text-[var(--cw-available)]",
  locked: "bg-[var(--cw-locked)]/10 text-[var(--cw-locked)]",
} as const;

/**
 * Office visits in journey order (PRD F4 "where", persona "fewest office visits"): the in-person or hybrid
 * steps grouped by office (existing planOfficeTrips), what each visit covers and what to carry.
 * Addresses and hours appear only when the seed data states them; otherwise "not verified" (PRD §13.1).
 */
export function OfficeVisitsPanel({ journey, completed }: OfficeVisitsPanelProps) {
  const selectStep = useTaskStore((s) => s.selectStep);
  const trips = useMemo(() => planOfficeTrips(journey), [journey]);
  const states = useMemo(() => deriveStepStates(journey, completed), [journey, completed]);
  const steps = useMemo(() => new Map(journey.steps.map((s) => [s.id, s])), [journey]);
  const [ward, setWard] = useState<string>("");
  const wardOffice = WARD_OFFICES.find((o) => o.ward === ward);
  // MCGM ward-office visits get their address from the ward the citizen picks (verbatim from that ward's manual)
  const isWardTrip = (stepIds: string[]) =>
    stepIds.some((id) => {
      const s = steps.get(id);
      return s !== undefined && s.kind === "government" && s.authoritySlug === "mcgm" && s.officeType === "ward_office";
    });
  const hasWardTrips = trips.some((t) => isWardTrip(t.stepIds));

  if (trips.length === 0) {
    return (
      <p className="text-xs text-[var(--cw-text-muted)]" data-testid="office-visits-none">
        No office visits: every required step on your map can be done online.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="office-visits">
      {hasWardTrips && WARD_OFFICES.length > 0 && (
        <label className="flex flex-col gap-1.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface-muted)] p-3">
          <span className="text-xs font-semibold text-[var(--cw-text)]">Your MCGM ward</span>
          <select
            value={ward}
            onChange={(e) => setWard(e.target.value)}
            data-testid="ward-select"
            className="rounded-lg border border-[var(--cw-border)] bg-[var(--cw-surface)] px-2 py-1.5 text-xs text-[var(--cw-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cw-available)]"
          >
            <option value="">Choose your ward…</option>
            {WARD_OFFICES.map((o) => (
              <option key={o.ward} value={o.ward}>
                {o.ward} Ward
              </option>
            ))}
          </select>
          <span className="text-[10px] text-[var(--cw-text-muted)]">
            Addresses for {WARD_OFFICES.length} wards so far, copied from each ward&apos;s official MCGM manual.
          </span>
        </label>
      )}
      {wardOffice && !wardOffice.mapCheckedOn && (
        <p className="text-[11px] text-[var(--cw-text-muted)] rounded-xl border border-[var(--cw-border)] px-3 py-2" data-testid="ward-map-unchecked">
          Google Maps couldn&apos;t reliably place the {wardOffice.ward} Ward office from its official address, so no map is
          shown. Use &quot;Open in Google Maps&quot; below and check the result against the address.
        </p>
      )}
      {wardOffice?.mapCheckedOn && (
        <figure className="flex flex-col gap-1.5" data-testid="ward-map">
          <iframe
            key={wardOffice.ward}
            title={`Map: ${wardOffice.office}`}
            src={mapsEmbedUrl(wardOffice.address)}
            loading="lazy"
            className="w-full h-[220px] rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface-muted)]"
          />
          <figcaption className="text-[10px] text-[var(--cw-text-muted)]">
            Map by Google, located from the official address of the {wardOffice.ward} Ward Water Works office. Check the
            pin against the address before you travel.
          </figcaption>
        </figure>
      )}
      <p className="text-xs text-[var(--cw-text-muted)]">
        {trips.length} office visit{trips.length === 1 ? "" : "s"}, in the order your journey needs them.
      </p>
      <ol className="flex flex-col gap-3">
        {trips.map((trip, index) => {
          const tripSteps = trip.stepIds.flatMap((id) => {
            const s = steps.get(id);
            return s && s.kind !== "milestone" ? [s] : [];
          });
          const office = tripSteps.find((s) => s.office)?.office;
          const wardAddress = isWardTrip(trip.stepIds) ? wardOffice : undefined;
          const address = office?.address ?? wardAddress?.address;
          const hours = office?.hours ?? wardAddress?.hours;
          const allDone = tripSteps.every((s) => states.get(s.id) === "done");
          const carry = [...new Map(tripSteps.flatMap((s) => s.documents).map((d) => [d.key, d])).values()];
          return (
            <li
              key={trip.key}
              data-testid="office-visit"
              className="rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-3 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cw-text-muted)]">
                    Visit {index + 1}
                    {trip.mayApply ? " · may apply" : ""}
                  </p>
                  <p className="text-sm font-bold text-[var(--cw-text)] leading-snug">{trip.name}</p>
                </div>
                {allDone && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--cw-done)]/10 text-[var(--cw-done)]">
                    Done
                  </span>
                )}
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                <dt className="text-[var(--cw-text-muted)]">Address</dt>
                <dd className="text-[var(--cw-text)]" data-testid="visit-address">
                  {address ?? (isWardTrip(trip.stepIds) ? "Choose your ward above" : "Not verified")}
                </dd>
                <dt className="text-[var(--cw-text-muted)]">Hours</dt>
                <dd className="text-[var(--cw-text)]">{hours ?? "Not verified"}</dd>
              </dl>
              {!address && !isWardTrip(trip.stepIds) && (
                // No fixed office in the data (e.g. a GST Suvidha Kendra is assigned per applicant): show where the
                // verified step text says the visit happens instead of a map pin we would have to invent (PRD §13.1).
                <div className="flex flex-col gap-1 rounded-lg bg-[var(--cw-surface-muted)] border border-[var(--cw-border)] px-2 py-1.5" data-testid="visit-where">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cw-text-muted)]">
                    Where, per the official source
                  </p>
                  {tripSteps.map((s) => {
                    const src = s.sources[0];
                    return (
                      <p key={s.id} className="text-[11px] text-[var(--cw-text)]">
                        {s.description}
                        {src && (
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-[10px] text-[var(--cw-available)] underline underline-offset-2"
                          >
                            Source
                          </a>
                        )}
                      </p>
                    );
                  })}
                  <p className="text-[10px] text-[var(--cw-text-muted)]">No single office to map for this visit.</p>
                </div>
              )}
              {address && (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={mapsSearchUrl(address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="open-in-maps"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--cw-brand)] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    Open in Google Maps
                  </a>
                  {wardAddress && (
                    <a
                      href={wardAddress.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[var(--cw-available)] underline underline-offset-2"
                    >
                      Source: {wardAddress.ward} Ward MCGM manual
                    </a>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cw-text-muted)]">For</p>
                <ul className="flex flex-col gap-1">
                  {tripSteps.map((s) => {
                    const state = states.get(s.id) ?? "locked";
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => selectStep(s.id)}
                          className="text-left font-medium text-[var(--cw-text)] underline decoration-[var(--cw-border)] underline-offset-2 hover:decoration-[var(--cw-text)]"
                        >
                          {s.title}
                        </button>
                        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATE_CLASS[state]}`}>
                          {STATE_TEXT[state]} · {s.mode.replace("_", " ")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {carry.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cw-text-muted)]">Carry</p>
                  <ul className="list-disc pl-4 text-[11px] text-[var(--cw-text)]">
                    {carry.map((d) => (
                      <li key={d.key}>{d.personLabel ? `${d.name} (${d.personLabel})` : d.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-[var(--cw-text-muted)]">
        Addresses and hours are shown only when an official page states them. Check the step&apos;s official source
        before you go.
      </p>
    </div>
  );
}
