"use client";

import React, { useMemo } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import { isOfficialUrl } from "@/lib/contract/officialSources";
import { planOfficeTrips } from "@/lib/graph/trips";
import { deriveStepStates } from "@/lib/graph/progress";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { useViewStore } from "@/lib/store/useViewStore";

export interface WardOfficeDataset {
  ward: string;
  office: string;
  address: string;
  hours?: string;
  source: { url: string; title: string };
}

export interface OfficeVisitsPanelProps {
  journey: ComposedJourney;
  completed: ReadonlySet<string>;
  wardOffices?: WardOfficeDataset[];
  onClose?: () => void;
}

const STATE_BADGE: Record<string, { label: string; className: string }> = {
  done: {
    label: "Done",
    className: "bg-[var(--cw-done)]/10 text-[var(--cw-done)] font-semibold",
  },
  available: {
    label: "Available",
    className: "bg-[var(--cw-available)]/10 text-[var(--cw-available)] font-semibold",
  },
  locked: {
    label: "Locked",
    className: "bg-[var(--cw-locked)]/10 text-[var(--cw-text-muted)] font-medium",
  },
};

/**
 * Office Visits Panel overlay (B2, #1):
 * In-person and hybrid steps grouped by office, what to carry, addresses/hours, official links, and Google Maps actions.
 */
export function OfficeVisitsPanel({
  journey,
  completed,
  wardOffices,
  onClose,
}: OfficeVisitsPanelProps) {
  const trips = useMemo(() => planOfficeTrips(journey), [journey]);
  const states = useMemo(
    () => deriveStepStates(journey, completed),
    [journey, completed]
  );
  const steps = useMemo(
    () => new Map(journey.steps.map((s) => [s.id, s])),
    [journey]
  );

  const selectStep = useTaskStore((s) => s.selectStep);
  const setFocusedStepId = useViewStore((s) => s.setFocusedStepId);

  // TODO(FE-6b): integrate PR #37 ward dataset when merged
  const showWardPicker = Boolean(wardOffices && wardOffices.length > 0);

  return (
    <div
      data-testid="office-visits-panel"
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--cw-border)]/60 shrink-0">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-[var(--cw-brand)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span className="text-sm font-bold text-[var(--cw-text)]">
            Office Visits
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            data-testid="close-panel-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] hover:bg-[var(--cw-border)]/20 transition-colors cursor-pointer"
            aria-label="Close panel"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {showWardPicker && (
          <div className="p-3 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] flex flex-col gap-2">
            <span className="text-xs font-semibold text-[var(--cw-text)]">
              Select your ward office
            </span>
            {/* Ward selector will render when PR #37 dataset is passed */}
          </div>
        )}

        <p className="text-xs text-[var(--cw-text-muted)]">
          {trips.length} office {trips.length === 1 ? "visit" : "visits"}, in
          the order your journey needs them.
        </p>

        {trips.length === 0 ? (
          <div className="p-6 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] text-center flex flex-col items-center justify-center gap-1.5">
            <p className="text-xs font-semibold text-[var(--cw-text)]">
              100 % Online Journey
            </p>
            <p className="text-[11px] text-[var(--cw-text-muted)]">
              No in-person office visits are required for this route.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {trips.map((trip, index) => {
              const tripSteps = trip.stepIds.flatMap((id) => {
                const s = steps.get(id);
                return s && s.kind !== "milestone" ? [s] : [];
              });

              const office = tripSteps.find((s) => s.office)?.office;
              const address = office?.address;
              const hours = office?.hours;
              const allDone = tripSteps.every(
                (s) => states.get(s.id) === "done"
              );

              // Union of documents needed across the trip's steps
              const carry = [
                ...new Map(
                  tripSteps
                    .flatMap((s) => s.documents)
                    .map((d) => [d.key, d])
                ).values(),
              ];

              return (
                <li
                  key={trip.key}
                  data-testid="office-visit"
                  className="rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-3.5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
                        Visit {index + 1}
                        {trip.mayApply ? " · may apply" : ""}
                      </p>
                      <p className="text-sm font-bold text-[var(--cw-text)] leading-snug mt-0.5">
                        {trip.name}
                      </p>
                    </div>
                    {allDone && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--cw-done)]/10 text-[var(--cw-done)]">
                        Done
                      </span>
                    )}
                  </div>

                  {/* Address and Hours */}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 text-xs">
                    <dt className="text-[var(--cw-text-muted)] font-medium">
                      Address:
                    </dt>
                    <dd className="text-[var(--cw-text)]" data-testid="visit-address">
                      {address ?? "Location not verified"}
                    </dd>
                    <dt className="text-[var(--cw-text-muted)] font-medium">
                      Hours:
                    </dt>
                    <dd className="text-[var(--cw-text)]">
                      {hours ?? "Hours not verified"}
                    </dd>
                  </dl>

                  {/* Fallback where text */}
                  {!address && (
                    <div
                      className="flex flex-col gap-1 rounded-xl bg-[var(--cw-surface)] border border-[var(--cw-border)] px-2.5 py-2"
                      data-testid="visit-where"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
                        Where, per official source
                      </p>
                      {tripSteps.map((s) => {
                        const src = s.sources[0];
                        return (
                          <p
                            key={s.id}
                            className="text-xs text-[var(--cw-text)] leading-relaxed"
                          >
                            {s.description || s.title}
                            {src && (
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 text-[11px] font-medium text-[var(--cw-brand)] underline underline-offset-2 inline-flex items-center gap-0.5"
                              >
                                Source
                              </a>
                            )}
                          </p>
                        );
                      })}
                    </div>
                  )}

                  {/* Maps action if address verified */}
                  {address && (
                    <div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          address
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="open-in-maps"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--cw-brand)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        Open in Google Maps
                      </a>
                    </div>
                  )}

                  {/* Steps covered */}
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-[var(--cw-border)]/50">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
                      Covers {tripSteps.length}{" "}
                      {tripSteps.length === 1 ? "step" : "steps"}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {tripSteps.map((s) => {
                        const state = states.get(s.id) ?? "locked";
                        const badge =
                          STATE_BADGE[state] ?? STATE_BADGE["locked"]!;
                        return (
                          <li
                            key={s.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                selectStep(s.id);
                                setFocusedStepId(s.id);
                              }}
                              className="text-left font-medium text-[var(--cw-text)] underline decoration-[var(--cw-border)] underline-offset-2 hover:decoration-[var(--cw-text)] truncate cursor-pointer"
                            >
                              {s.title}
                            </button>
                            <span
                              className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* What to carry */}
                  {carry.length > 0 && (
                    <div className="flex flex-col gap-1 pt-1 border-t border-[var(--cw-border)]/50">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
                        What to carry ({carry.length})
                      </p>
                      <ul className="list-disc pl-4 text-xs text-[var(--cw-text)] flex flex-col gap-0.5">
                        {carry.map((d) => (
                          <li key={d.key}>
                            {d.personLabel
                              ? `${d.name} (${d.personLabel})`
                              : d.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <p className="text-[11px] text-[var(--cw-text-muted)] leading-relaxed pt-2">
          Addresses and hours are shown only when an official page states them. Check the step&apos;s official source before you travel.
        </p>
      </div>
    </div>
  );
}
