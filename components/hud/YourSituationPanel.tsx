"use client";

import React from "react";
import type { ApprovalModule, JourneyTemplate } from "@/lib/contract/schema";
import type { ComposedJourney } from "@/lib/contract/compose";
import { FactCard } from "./FactCard";
import { QuestionsPanel } from "./QuestionsPanel";
import { ExcludedList } from "./ExcludedList";

export interface YourSituationPanelProps {
  template: JourneyTemplate;
  modules: ApprovalModule[];
  journey?: ComposedJourney;
  className?: string;
}

export function YourSituationPanel({
  template,
  modules,
  journey,
  className = "",
}: YourSituationPanelProps) {
  return (
    <div
      data-testid="your-situation-panel"
      className={`flex flex-col gap-3 overflow-y-auto ${className}`}
    >
      {/* 1. Profile & Facts */}
      <FactCard template={template} modules={modules} />

      {/* 2. Decisive Questions */}
      {journey && <QuestionsPanel journey={journey} />}

      {/* 3. Not Needed For You (Excluded steps/modules) */}
      {journey && journey.excluded.length > 0 && (
        <ExcludedList excluded={journey.excluded} />
      )}
    </div>
  );
}
