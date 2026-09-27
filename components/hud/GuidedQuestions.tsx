"use client";

import React, { useState } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import type { FactKey, FactValue } from "@/lib/contract/facts";
import { FactInput } from "./FactInput";

export interface GuidedQuestionsProps {
  journey: ComposedJourney;
  onAnswer: (fact: FactKey, value: FactValue) => void;
  onOpenWhatIf: () => void;
}

/**
 * "Does this apply to you?": asks the decisive questions one at a time (PRD §8.6). The list comes from the
 * composed journey: only facts that are still unknown and change the map, most affected stations first.
 */
export function GuidedQuestions({ journey, onAnswer, onOpenWhatIf }: GuidedQuestionsProps) {
  const [skipped, setSkipped] = useState<ReadonlySet<FactKey>>(new Set());
  const pending = journey.questions.filter((q) => !skipped.has(q.fact));
  const current = pending[0];

  if (!current) {
    return (
      <div className="flex flex-col gap-3" data-testid="guided-questions-done">
        <p className="text-sm font-semibold text-[var(--cw-text)]">
          {journey.questions.length === 0 ? "Your map is fully personalised." : "You skipped the remaining questions."}
        </p>
        <p className="text-xs text-[var(--cw-text-muted)]">
          {journey.questions.length === 0
            ? "Every question that changes your journey has an answer."
            : `${journey.questions.length} question${journey.questions.length === 1 ? "" : "s"} still change the map; stations that depend on them show as "may apply".`}
        </p>
        <div className="flex gap-2">
          {skipped.size > 0 && (
            <button
              type="button"
              onClick={() => setSkipped(new Set())}
              className="px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--cw-border)] hover:bg-[var(--cw-surface-muted)]"
            >
              Show skipped questions
            </button>
          )}
          <button
            type="button"
            onClick={onOpenWhatIf}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--cw-border)] hover:bg-[var(--cw-surface-muted)]"
          >
            Change an answer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="guided-questions">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cw-text-muted)]">
        {pending.length} question{pending.length === 1 ? "" : "s"} left · affects {current.affectedStepCount} station
        {current.affectedStepCount === 1 ? "" : "s"}
      </p>
      <div key={current.fact} className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in duration-200">
        <h3 id={`q-${current.fact}`} className="text-base font-bold text-[var(--cw-text)] leading-snug">
          {current.text}
        </h3>
        {current.help && <p className="text-xs text-[var(--cw-text-muted)]">{current.help}</p>}
        <FactInput
          fact={current.fact}
          value={undefined}
          options={current.options}
          label={current.text}
          onChange={(v) => onAnswer(current.fact, v)}
        />
      </div>
      <button
        type="button"
        onClick={() => setSkipped((s) => new Set(s).add(current.fact))}
        className="self-start text-xs font-semibold text-[var(--cw-text-muted)] underline underline-offset-2 hover:text-[var(--cw-text)]"
      >
        Skip for now
      </button>
    </div>
  );
}
