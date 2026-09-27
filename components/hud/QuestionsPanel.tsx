"use client";

import React from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import type { FactKey, FactValue } from "@/lib/contract/facts";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { GuidedQuestions } from "./GuidedQuestions";

export interface QuestionsPanelProps {
  journey: ComposedJourney;
  className?: string;
}

export function QuestionsPanel({ journey, className = "" }: QuestionsPanelProps) {
  const storeActiveTaskId = useTaskStore((s) => s.activeTaskId);
  const targetTaskId = storeActiveTaskId ?? journey.taskId;
  const setFact = useTaskStore((s) => s.setFact);

  const handleAnswer = (fact: FactKey, value: FactValue) => {
    if (!targetTaskId) return;
    setFact(targetTaskId, fact, value);
  };

  return (
    <div data-testid="questions-panel" className={className}>
      <GuidedQuestions
        journey={journey}
        onAnswer={handleAnswer}
      />
    </div>
  );
}
