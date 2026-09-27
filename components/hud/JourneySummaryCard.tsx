"use client";

import React from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import type { JourneyTemplate } from "@/lib/contract/schema";
import { FACTS, type Facts } from "@/lib/contract/facts";
import type { JourneySummaryValues } from "./SummaryBar";
import { summarizeVerification } from "./VerificationBanner";
import { formatFactValue } from "./factDisplay";

export interface JourneySummaryCardProps {
  journey: ComposedJourney;
  template: JourneyTemplate;
  facts: Facts;
  summary: JourneySummaryValues;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cw-text-muted)]">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Your profile, the derived totals and what isn't needed, all derived from the composed journey
 * (PRD P3: derived, never stored). Totals only count verified-and-sourced values; the rest say "not verified".
 */
export function JourneySummaryCard({ journey, template, facts, summary }: JourneySummaryCardProps) {
  const actionSteps = journey.steps.filter((s) => s.kind !== "milestone").length;
  const verification = summarizeVerification(journey);
  const verified = actionSteps - verification.unverifiedCount - verification.flaggedCount;
  const hasQuestions = template.questions.length > 0;
  const answered = template.questions.filter((q) => facts[q.fact] !== undefined);
  const excluded = journey.excluded;

  const tiles: [string, string][] = [
    ["Next up", summary.nextUpTile.fullText],
    ["Fees", summary.feesTile.fullText],
    ["Time", summary.timeTile.fullText],
    ["Office visits", summary.visitsTile.fullText],
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="journey-summary">
      <div>
        <p className="text-base font-bold text-[var(--cw-text)] leading-snug">{journey.title}</p>
        <p className="text-xs text-[var(--cw-text-muted)]">
          {hasQuestions ? "Personalised from your answers" : "Same for everyone: no questions change this journey"} ·{" "}
          {actionSteps} steps · {verified} of {actionSteps} verified against official
          sources
          {verification.flaggedCount > 0 ? ` · ${verification.flaggedCount} flagged` : ""}
        </p>
      </div>

      {hasQuestions && (
      <Section title="Your answers">
        {answered.length === 0 ? (
          <p className="text-xs text-[var(--cw-text-muted)]">No answers yet. Open Questions to personalise the map.</p>
        ) : (
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs">
            {answered.map((q) => {
              const value = facts[q.fact];
              return value === undefined ? null : (
                <React.Fragment key={q.fact}>
                  <dt className="text-[var(--cw-text-muted)]">{FACTS[q.fact].label}</dt>
                  <dd className="font-semibold text-[var(--cw-text)] text-right">{formatFactValue(q.fact, value, q)}</dd>
                </React.Fragment>
              );
            })}
          </dl>
        )}
      </Section>
      )}

      <Section title="Totals">
        <dl className="flex flex-col gap-1.5 text-xs">
          {tiles.map(([label, text]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-[var(--cw-text-muted)]">{label}</dt>
              <dd className="font-semibold text-[var(--cw-text)]">{text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title={`Not needed for you (${excluded.length})`}>
        {excluded.length === 0 ? (
          <p className="text-xs text-[var(--cw-text-muted)]">Everything in this journey applies, or may apply, to you.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {excluded.map((item) => (
              <li
                key={item.kind === "step" ? item.stepId : item.moduleId}
                className="rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface-muted)] px-3 py-2"
              >
                <p className="text-xs font-semibold text-[var(--cw-text)]">{item.title}</p>
                <p className="text-[11px] text-[var(--cw-text-muted)]">{item.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
