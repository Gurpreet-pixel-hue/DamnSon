"use client";

import React from "react";
import type { ApprovalModule, JourneyTemplate } from "@/lib/contract/schema";
import type { ComposedJourney } from "@/lib/contract/compose";
import type { FactKey, FactValue } from "@/lib/contract/facts";
import type { JourneyDiff } from "@/lib/graph/journeyDiff";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { FactCard } from "./FactCard";
import { QuestionsPanel } from "./QuestionsPanel";
import { ExcludedList } from "./ExcludedList";
import { WhatIfPanel } from "./WhatIfPanel";
import type { TotalsChange } from "./totalsChange";

export interface YourSituationPanelProps {
  template: JourneyTemplate;
  modules: ApprovalModule[];
  journey?: ComposedJourney;
  lastChange?: JourneyDiff | null;
  lastTotals?: TotalsChange[];
  className?: string;
}

export function YourSituationPanel({
  template,
  modules,
  journey,
  lastChange,
  lastTotals,
  className = "",
}: YourSituationPanelProps) {
  const taskId = template.taskId;
  const factsByTask = useTaskStore((s) => s.factsByTask);
  const facts = factsByTask[taskId] ?? {};
  const setFact = useTaskStore((s) => s.setFact);
  const clearFact = useTaskStore((s) => s.clearFact);

  const handleWhatIfChange = (fact: FactKey, value: FactValue | undefined) => {
    if (value === undefined) {
      clearFact(taskId, fact);
    } else {
      setFact(taskId, fact, value);
    }
  };

  return (
    <div
      data-testid="your-situation-panel"
      className={`flex flex-col gap-3 overflow-y-auto ${className}`}
    >
      {/* 1. Key Questions (Top 3) */}
      {journey && <QuestionsPanel journey={journey} />}

      {/* 2. Your Answers (FactCard) */}
      <FactCard template={template} modules={modules} />

      {/* 3. What if... (Change an answer) */}
      <WhatIfPanel
        template={template}
        facts={facts}
        lastChange={lastChange}
        lastTotals={lastTotals}
        onChange={handleWhatIfChange}
      />

      {/* 4. Not Needed For You (Excluded steps/modules) */}
      {journey && journey.excluded.length > 0 && (
        <ExcludedList excluded={journey.excluded} template={template} />
      )}
    </div>
  );
}

