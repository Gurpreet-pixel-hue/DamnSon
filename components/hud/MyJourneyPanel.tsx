"use client";

import React, { useMemo } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import type { JourneyTemplate } from "@/lib/contract/schema";
import { FACTS, type Facts } from "@/lib/contract/facts";
import type { JourneySummaryValues } from "./SummaryBar";
import { summarizeVerification } from "./VerificationBanner";
import { formatFactValue } from "@/lib/graph/factDisplay";
import { deriveStepStates } from "@/lib/graph/progress";

export interface MyJourneyPanelProps {
  journey: ComposedJourney;
  template: JourneyTemplate;
  facts: Facts;
  completed: ReadonlySet<string>;
  summary: JourneySummaryValues;
  onClose?: () => void;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * My Journey Panel overlay (B1, #10):
 * Personalised summary, your answers with factDisplay labels, honest totals, step progress, and not needed items.
 */
export function MyJourneyPanel({
  journey,
  template,
  facts,
  completed,
  summary,
  onClose,
}: MyJourneyPanelProps) {
  const actionSteps = useMemo(
    () => journey.steps.filter((s) => s.kind !== "milestone"),
    [journey.steps]
  );
  const verification = useMemo(
    () => summarizeVerification(journey),
    [journey]
  );
  const verified =
    actionSteps.length -
    verification.unverifiedCount -
    verification.flaggedCount;
  const hasQuestions = template.questions.length > 0;
  const answered = template.questions.filter(
    (q) => facts[q.fact] !== undefined
  );
  const excluded = journey.excluded;

  // Step state counts
  const stepStates = useMemo(
    () => deriveStepStates(journey, completed),
    [journey, completed]
  );

  const { doneCount, availableCount, lockedCount } = useMemo(() => {
    let d = 0;
    let a = 0;
    let l = 0;
    for (const step of actionSteps) {
      const st = stepStates.get(step.id);
      if (st === "done") d++;
      else if (st === "available") a++;
      else l++;
    }
    return { doneCount: d, availableCount: a, lockedCount: l };
  }, [actionSteps, stepStates]);

  return (
    <div
      data-testid="my-journey-panel"
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
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <span className="text-sm font-bold text-[var(--cw-text)]">
            My Journey
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
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {/* Journey Title & Verification Status */}
        <div className="flex flex-col gap-1">
          <p className="text-base font-bold text-[var(--cw-text)] leading-snug">
            {journey.title}
          </p>
          <p className="text-xs text-[var(--cw-text-muted)] leading-relaxed">
            {hasQuestions
              ? "Personalised from your answers"
              : "Standard route: no questions change this journey"}{" "}
            · {actionSteps.length} steps · {verified} of {actionSteps.length}{" "}
            verified against official sources
            {verification.flaggedCount > 0
              ? ` · ${verification.flaggedCount} flagged`
              : ""}
          </p>
        </div>

        {/* Progress Counts */}
        <Section title="Progress">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] text-center">
              <span className="text-base font-bold text-[var(--cw-done)]">
                {doneCount}
              </span>
              <span className="text-[10px] font-semibold uppercase text-[var(--cw-text-muted)]">
                Done
              </span>
            </div>
            <div className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] text-center">
              <span className="text-base font-bold text-[var(--cw-available)]">
                {availableCount}
              </span>
              <span className="text-[10px] font-semibold uppercase text-[var(--cw-text-muted)]">
                Available
              </span>
            </div>
            <div className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] text-center">
              <span className="text-base font-bold text-[var(--cw-text-muted)]">
                {lockedCount}
              </span>
              <span className="text-[10px] font-semibold uppercase text-[var(--cw-text-muted)]">
                Locked
              </span>
            </div>
          </div>
        </Section>

        {/* Totals via Honest Tiles (no ₹0) */}
        <Section title="Totals">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex flex-col p-2.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)]">
              <dt className="text-[10px] font-semibold uppercase text-[var(--cw-text-muted)]">
                Estimated fees
              </dt>
              <dd className="font-bold text-[var(--cw-text)] mt-0.5">
                {summary.feesTile.value}
              </dd>
              {summary.feesTile.subtext && (
                <span className="text-[10px] text-[var(--cw-text-muted)]">
                  {summary.feesTile.subtext}
                </span>
              )}
            </div>
            <div className="flex flex-col p-2.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)]">
              <dt className="text-[10px] font-semibold uppercase text-[var(--cw-text-muted)]">
                Total time
              </dt>
              <dd className="font-bold text-[var(--cw-text)] mt-0.5">
                {summary.timeTile.value}
              </dd>
              {summary.timeTile.subtext && (
                <span className="text-[10px] text-[var(--cw-text-muted)]">
                  {summary.timeTile.subtext}
                </span>
              )}
            </div>
            <div className="flex flex-col p-2.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)]">
              <dt className="text-[10px] font-semibold uppercase text-[var(--cw-text-muted)]">
                Next up
              </dt>
              <dd className="font-bold text-[var(--cw-text)] mt-0.5 line-clamp-1">
                {summary.nextUpTile.value}
              </dd>
              {summary.nextUpTile.subtext && (
                <span className="text-[10px] text-[var(--cw-text-muted)]">
                  {summary.nextUpTile.subtext}
                </span>
              )}
            </div>
            <div className="flex flex-col p-2.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)]">
              <dt className="text-[10px] font-semibold uppercase text-[var(--cw-text-muted)]">
                Office visits
              </dt>
              <dd className="font-bold text-[var(--cw-text)] mt-0.5">
                {summary.visitsTile.value}
              </dd>
              {summary.visitsTile.subtext && (
                <span className="text-[10px] text-[var(--cw-text-muted)]">
                  {summary.visitsTile.subtext}
                </span>
              )}
            </div>
          </dl>
        </Section>

        {/* Your Answers */}
        {hasQuestions && (
          <Section title="Your answers">
            {answered.length === 0 ? (
              <p className="text-xs text-[var(--cw-text-muted)]">
                No answers given yet. Answer questions in the rail to personalise your journey.
              </p>
            ) : (
              <dl className="flex flex-col gap-2 text-xs">
                {answered.map((q) => {
                  const value = facts[q.fact];
                  if (value === undefined) return null;
                  return (
                    <div
                      key={q.fact}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] gap-2"
                    >
                      <div className="flex flex-col min-w-0">
                        <dt className="text-[10px] font-semibold uppercase text-[var(--cw-text-muted)]">
                          {FACTS[q.fact]?.label ?? q.fact}
                        </dt>
                        <dd className="font-semibold text-[var(--cw-text)] truncate mt-0.5">
                          {formatFactValue(q.fact, value, q)}
                        </dd>
                      </div>
                    </div>
                  );
                })}
              </dl>
            )}
          </Section>
        )}

        {/* Excluded Steps / Modules */}
        <Section title={`Not needed for you (${excluded.length})`}>
          {excluded.length === 0 ? (
            <p className="text-xs text-[var(--cw-text-muted)]">
              Everything in this journey applies, or may apply, to you.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {excluded.map((item) => (
                <li
                  key={item.kind === "step" ? item.stepId : item.moduleId}
                  className="rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-2.5 flex flex-col gap-0.5"
                >
                  <p className="text-xs font-semibold text-[var(--cw-text)]">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-[var(--cw-text-muted)] leading-relaxed">
                    {item.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
