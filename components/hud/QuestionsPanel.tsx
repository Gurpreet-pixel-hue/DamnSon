"use client";

import React, { useState } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import type { FactKey, FactValue } from "@/lib/contract/facts";
import { useTaskStore } from "@/lib/store/useTaskStore";

export interface QuestionsPanelProps {
  journey: ComposedJourney;
  className?: string;
}

export function QuestionsPanel({ journey, className = "" }: QuestionsPanelProps) {
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const setFact = useTaskStore((s) => s.setFact);
  const [showMore, setShowMore] = useState(false);

  const questions = journey.questions;
  if (questions.length === 0) return null;

  const topQuestions = questions.slice(0, 3);
  const remainingQuestions = questions.slice(3);

  const handleAnswer = (fact: FactKey, value: FactValue) => {
    if (!activeTaskId) return;
    setFact(activeTaskId, fact, value);
  };

  return (
    <div
      data-testid="questions-panel"
      className={`rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-3.5 flex flex-col gap-3 shadow-2xs ${className}`}
    >
      <div className="flex items-center justify-between border-b border-[var(--cw-border)]/50 pb-2">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-[var(--cw-text)] tracking-tight">
            Key Questions
          </span>
          <span className="text-[10px] text-[var(--cw-text-muted)]">
            Helps prune steps you don&apos;t need
          </span>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300">
          {questions.length} decisive
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {topQuestions.map((q) => (
          <div
            key={q.fact}
            data-testid={`question-item-${q.fact}`}
            className="p-3 rounded-lg border border-[var(--cw-border)]/60 bg-[var(--cw-background)] flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-xs text-[var(--cw-text)] leading-snug">
                {q.text}
              </span>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[var(--cw-border)]/40 text-[var(--cw-text-muted)] shrink-0">
                Affects {q.affectedStepCount} steps
              </span>
            </div>

            {q.help && (
              <p className="text-[10px] text-[var(--cw-text-muted)] leading-relaxed">
                {q.help}
              </p>
            )}

            {/* Answer inputs based on answerType */}
            {q.answerType === "boolean" && (
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                <button
                  type="button"
                  data-testid={`question-answer-yes-${q.fact}`}
                  onClick={() => handleAnswer(q.fact, true)}
                  className="py-1 px-2 rounded-md text-xs font-semibold border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] hover:bg-[var(--cw-brand)] hover:text-white hover:border-[var(--cw-brand)] transition-colors"
                >
                  Yes
                </button>
                <button
                  type="button"
                  data-testid={`question-answer-no-${q.fact}`}
                  onClick={() => handleAnswer(q.fact, false)}
                  className="py-1 px-2 rounded-md text-xs font-semibold border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] hover:bg-[var(--cw-brand)] hover:text-white hover:border-[var(--cw-brand)] transition-colors"
                >
                  No
                </button>
              </div>
            )}

            {q.answerType === "enum" && q.options && (
              <div className="flex flex-wrap gap-1 mt-1">
                {q.options.map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    data-testid={`question-opt-${q.fact}-${opt.value}`}
                    onClick={() => handleAnswer(q.fact, opt.value)}
                    className="py-1 px-2 rounded-md text-[11px] font-medium border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] hover:bg-[var(--cw-brand)] hover:text-white hover:border-[var(--cw-brand)] transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* More questions accordion */}
        {remainingQuestions.length > 0 && (
          <div className="pt-1 flex flex-col gap-2">
            <button
              type="button"
              data-testid="toggle-more-questions"
              onClick={() => setShowMore(!showMore)}
              className="w-full py-1.5 text-[11px] font-semibold text-[var(--cw-brand)] hover:underline flex items-center justify-center gap-1"
            >
              <span>{showMore ? "Hide additional questions" : `More questions (${remainingQuestions.length})`}</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform ${showMore ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showMore && (
              <div className="flex flex-col gap-2.5">
                {remainingQuestions.map((q) => (
                  <div
                    key={q.fact}
                    data-testid={`question-item-${q.fact}`}
                    className="p-3 rounded-lg border border-[var(--cw-border)]/60 bg-[var(--cw-background)] flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-xs text-[var(--cw-text)] leading-snug">
                        {q.text}
                      </span>
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[var(--cw-border)]/40 text-[var(--cw-text-muted)] shrink-0">
                        Affects {q.affectedStepCount}
                      </span>
                    </div>

                    {q.help && (
                      <p className="text-[10px] text-[var(--cw-text-muted)] leading-relaxed">
                        {q.help}
                      </p>
                    )}

                    {q.answerType === "boolean" && (
                      <div className="grid grid-cols-2 gap-1.5 mt-1">
                        <button
                          type="button"
                          onClick={() => handleAnswer(q.fact, true)}
                          className="py-1 px-2 rounded-md text-xs font-semibold border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] hover:bg-[var(--cw-brand)] hover:text-white hover:border-[var(--cw-brand)] transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAnswer(q.fact, false)}
                          className="py-1 px-2 rounded-md text-xs font-semibold border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] hover:bg-[var(--cw-brand)] hover:text-white hover:border-[var(--cw-brand)] transition-colors"
                        >
                          No
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
