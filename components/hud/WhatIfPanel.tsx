"use client";

import React from "react";
import type { JourneyTemplate } from "@/lib/contract/schema";
import { FACTS, type FactKey, type FactValue, type Facts } from "@/lib/contract/facts";
import type { JourneyDiff } from "@/lib/graph/journeyDiff";
import { FactInput } from "./FactInput";
import type { TotalsChange } from "./totalsChange";

export interface WhatIfPanelProps {
  template: JourneyTemplate;
  facts: Facts;
  lastChange?: JourneyDiff | null;
  /** Summary figures that changed with the last answer (before → after). */
  lastTotals?: TotalsChange[];
  onChange: (fact: FactKey, value: FactValue | undefined) => void;
  className?: string;
}

/** Change an answer you already gave and see which stations appear or disappear, with the official reason (C4). */
export function WhatIfPanel({
  template,
  facts,
  lastChange,
  lastTotals = [],
  onChange,
  className = "",
}: WhatIfPanelProps) {
  const answered = template.questions.filter((q) => facts[q.fact] !== undefined);

  return (
    <div className={`flex flex-col gap-5 ${className}`} data-testid="what-if">
      <div className="flex items-center justify-between border-b border-[var(--cw-border)]/50 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--cw-text)]">
          What if…
        </h3>
        <span className="text-[10px] text-[var(--cw-text-muted)]">
          Change an answer
        </span>
      </div>

      {answered.length === 0 ? (
        <p className="text-xs text-[var(--cw-text-muted)] leading-relaxed">
          Answer a few questions first; then you can change them here.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {answered.map((q) => (
            <li key={q.fact} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--cw-text)]">
                  {FACTS[q.fact]?.label ?? q.fact}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(q.fact, undefined)}
                  className="text-[11px] font-semibold text-[var(--cw-text-muted)] underline underline-offset-2 hover:text-[var(--cw-text)] cursor-pointer"
                >
                  Clear
                </button>
              </div>
              <FactInput
                fact={q.fact}
                value={facts[q.fact]}
                options={q.options}
                label={q.text}
                onChange={(v) => onChange(q.fact, v)}
              />
            </li>
          ))}
        </ul>
      )}

      {lastChange &&
        (lastChange.added.length > 0 ||
          lastChange.removed.length > 0 ||
          lastChange.confirmed.length > 0) && (
          <section className="flex flex-col gap-2 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface-muted)] p-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cw-text-muted)]">
              Last change
            </h4>
            <ul className="flex flex-col gap-1.5 text-xs">
              {lastChange.added.map((c) => (
                <li key={`+${c.title}`} className="text-[var(--cw-done)] font-medium">
                  <span className="font-semibold">Added:</span> {c.title}
                  {c.count > 1 ? ` ×${c.count}` : ""}
                </li>
              ))}
              {lastChange.confirmed.map((c) => (
                <li key={`=${c.title}`} className="text-[var(--cw-available)] font-medium">
                  <span className="font-semibold">Now applies:</span> {c.title}
                  {c.count > 1 ? ` ×${c.count}` : ""}
                </li>
              ))}
              {lastChange.removed.map((c) => (
                <li key={`-${c.title}`} className="text-[var(--cw-text)]">
                  <span className="font-semibold text-rose-700">Removed:</span> {c.title}
                  {c.count > 1 ? ` ×${c.count}` : ""}
                  {c.reason && (
                    <span className="block text-[11px] text-[var(--cw-text-muted)]">
                      {c.reason}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {lastTotals.length > 0 && (
              <dl
                className="mt-1 pt-2 border-t border-[var(--cw-border)] flex flex-col gap-1 text-xs"
                data-testid="what-if-totals"
              >
                {lastTotals.map((t) => (
                  <div key={t.label} className="flex items-center justify-between">
                    <dt className="text-[11px] text-[var(--cw-text-muted)]">{t.label}:</dt>
                    <dd className="text-[var(--cw-text)] text-[11px]">
                      <span className="line-through text-[var(--cw-text-muted)] mr-1">
                        {t.before}
                      </span>
                      &rarr; <span className="font-semibold">{t.after}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}
    </div>
  );
}
