"use client";

import React, { useState } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import type { FactKey, FactValue } from "@/lib/contract/facts";
import { FactInput } from "./FactInput";

export interface GuidedQuestionsProps {
  journey: ComposedJourney;
  onAnswer: (fact: FactKey, value: FactValue) => void;
  onOpenWhatIf?: () => void;
  answeredFacts?: ReadonlySet<FactKey> | Record<string, FactValue>;
  className?: string;
}

/**
 * "Does this apply to you?": asks the decisive questions one at a time (PRD §8.6, C3).
 * Sourced from the composed journey: only facts that are still unknown and change the map,
 * most affected stations first.
 */
export function GuidedQuestions({
  journey,
  onAnswer,
  onOpenWhatIf,
  answeredFacts,
  className = "",
}: GuidedQuestionsProps) {
  const [skipped, setSkipped] = useState<ReadonlySet<FactKey>>(new Set());

  const isAnswered = (fact: FactKey) => {
    if (!answeredFacts) return false;
    if (answeredFacts instanceof Set) return answeredFacts.has(fact);
    return (answeredFacts as Record<string, FactValue>)[fact] !== undefined;
  };

  const pending = journey.questions.filter((q) => !skipped.has(q.fact) && !isAnswered(q.fact));
  const current = pending[0];

  if (!current) {
    const isZeroQuestions = journey.questions.length === 0;
    const hasFacts = Object.keys(journey.facts).length > 0;
    const isSameForEveryone = isZeroQuestions && !hasFacts;

    return (
      <div
        className={`flex flex-col gap-3 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-4 shadow-xs ${className}`}
        data-testid="guided-questions-done"
      >
        <p className="text-sm font-semibold text-[var(--cw-text)]">
          {isSameForEveryone
            ? "Same for everyone"
            : isZeroQuestions
            ? "Your map is fully personalised."
            : "You skipped the remaining questions."}
        </p>
        <p className="text-xs text-[var(--cw-text-muted)] leading-relaxed">
          {isSameForEveryone
            ? "This procedure has no conditional questions. Every step applies to all applicants in this jurisdiction."
            : isZeroQuestions
            ? "Every question that changes your journey has an answer."
            : `${journey.questions.length} question${
                journey.questions.length === 1 ? "" : "s"
              } still change the map; stations that depend on them show as "may apply".`}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {skipped.size > 0 && (
            <button
              type="button"
              onClick={() => setSkipped(new Set())}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] hover:bg-[var(--cw-surface-muted)] transition-colors cursor-pointer"
            >
              Show skipped questions
            </button>
          )}
          {onOpenWhatIf && (
            <button
              type="button"
              onClick={onOpenWhatIf}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] hover:bg-[var(--cw-surface-muted)] transition-colors cursor-pointer"
            >
              Change an answer
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-4 shadow-xs ${className}`}
      data-testid="guided-questions"
    >
      <div className="flex items-center justify-between border-b border-[var(--cw-border)]/50 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
          {pending.length} question{pending.length === 1 ? "" : "s"} left
        </p>
        <span className="text-[11px] font-medium text-[var(--cw-brand)]">
          affects {current.affectedStepCount} station
          {current.affectedStepCount === 1 ? "" : "s"}
        </span>
      </div>

      <div
        key={current.fact}
        className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in duration-200"
      >
        <h3
          id={`q-${current.fact}`}
          className="text-sm md:text-base font-bold text-[var(--cw-text)] leading-snug"
        >
          {current.text}
        </h3>
        {current.help && (
          <p className="text-xs text-[var(--cw-text-muted)] leading-relaxed">
            {current.help}
          </p>
        )}
        <FactInput
          fact={current.fact}
          value={undefined}
          options={current.options}
          label={current.text}
          onChange={(v) => onAnswer(current.fact, v)}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => setSkipped((s) => new Set(s).add(current.fact))}
          className="text-xs font-semibold text-[var(--cw-text-muted)] underline underline-offset-2 hover:text-[var(--cw-text)] cursor-pointer"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
