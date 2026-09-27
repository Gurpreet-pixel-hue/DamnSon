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
  lastChange: JourneyDiff | null;
  /** Summary figures that changed with the last answer (before → after). */
  lastTotals: TotalsChange[];
  onChange: (fact: FactKey, value: FactValue | undefined) => void;
}

/** Change an answer you already gave and see which stations appear or disappear, with the official reason. */
export function WhatIfPanel({ template, facts, lastChange, lastTotals, onChange }: WhatIfPanelProps) {
  const answered = template.questions.filter((q) => facts[q.fact] !== undefined);

  return (
    <div className="flex flex-col gap-5" data-testid="what-if">
      {answered.length === 0 ? (
        <p className="text-xs text-[var(--cw-text-muted)]">Answer a few questions first; then you can change them here.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {answered.map((q) => (
            <li key={q.fact} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--cw-text)]">{FACTS[q.fact].label}</span>
                <button
                  type="button"
                  onClick={() => onChange(q.fact, undefined)}
                  className="text-[11px] font-semibold text-[var(--cw-text-muted)] underline underline-offset-2 hover:text-[var(--cw-text)]"
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

      {lastChange && (lastChange.added.length > 0 || lastChange.removed.length > 0 || lastChange.confirmed.length > 0) && (
        <section className="flex flex-col gap-2 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface-muted)] p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cw-text-muted)]">Last change</h3>
          <ul className="flex flex-col gap-1.5 text-xs">
            {lastChange.added.map((c) => (
              <li key={`+${c.title}`} className="text-[var(--cw-done)]">
                <span className="font-semibold">Added:</span> {c.title}
                {c.count > 1 ? ` ×${c.count}` : ""}
              </li>
            ))}
            {lastChange.confirmed.map((c) => (
              <li key={`=${c.title}`} className="text-[var(--cw-available)]">
                <span className="font-semibold">Now applies:</span> {c.title}
                {c.count > 1 ? ` ×${c.count}` : ""}
              </li>
            ))}
            {lastChange.removed.map((c) => (
              <li key={`-${c.title}`} className="text-[var(--cw-text)]">
                <span className="font-semibold">Removed:</span> {c.title}
                {c.count > 1 ? ` ×${c.count}` : ""}
                {c.reason && <span className="block text-[11px] text-[var(--cw-text-muted)]">{c.reason}</span>}
              </li>
            ))}
          </ul>
          {lastTotals.length > 0 && (
            <dl className="mt-1 pt-2 border-t border-[var(--cw-border)] flex flex-col gap-1 text-xs" data-testid="what-if-totals">
              {lastTotals.map((t) => (
                <div key={t.label}>
                  <dt className="text-[11px] text-[var(--cw-text-muted)]">{t.label}</dt>
                  <dd className="text-[var(--cw-text)]">
                    <span className="line-through text-[var(--cw-text-muted)]">{t.before}</span> → <span className="font-semibold">{t.after}</span>
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
