"use client";

import React, { useEffect } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import type { JourneyTemplate } from "@/lib/contract/schema";
import type { FactKey, FactValue, Facts } from "@/lib/contract/facts";
import type { JourneyDiff } from "@/lib/graph/journeyDiff";
import type { TotalsChange } from "./totalsChange";
import { useViewStore, type JourneyPanel } from "@/lib/store/useViewStore";
import { DocumentChecklist } from "@/components/documents/DocumentChecklist";
import type { JourneySummaryValues } from "./SummaryBar";
import { GuidedQuestions } from "./GuidedQuestions";
import { JourneySummaryCard } from "./JourneySummaryCard";
import { WhatIfPanel } from "./WhatIfPanel";
import { OfficeVisitsPanel } from "./OfficeVisitsPanel";

export interface JourneyPanelsProps {
  journey: ComposedJourney;
  template: JourneyTemplate;
  facts: Facts;
  completed: ReadonlySet<string>;
  summary: JourneySummaryValues;
  lastChange: JourneyDiff | null;
  lastTotals: TotalsChange[];
  onFactChange: (fact: FactKey, value: FactValue | undefined) => void;
}

const TITLES: Record<JourneyPanel, string> = {
  questions: "Does this apply to you?",
  summary: "Your journey",
  whatif: "What if…",
  documents: "Documents",
  visits: "Office visits",
};

/** Docked side panel next to the city window; one panel at a time, chosen from the left rail. */
export function JourneyPanels(props: JourneyPanelsProps) {
  const activePanel = useViewStore((s) => s.activePanel);
  const setActivePanel = useViewStore((s) => s.setActivePanel);

  useEffect(() => {
    if (!activePanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActivePanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePanel, setActivePanel]);

  if (!activePanel) return null;

  return (
    <aside
      data-testid="journey-panel"
      aria-label={TITLES[activePanel]}
      className="w-[340px] shrink-0 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] shadow-xs flex flex-col min-h-0 motion-safe:animate-in motion-safe:slide-in-from-left-4 motion-safe:fade-in duration-200"
    >
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-[var(--cw-border)]">
        <h2 className="text-sm font-bold text-[var(--cw-text)]">{TITLES[activePanel]}</h2>
        <button
          type="button"
          onClick={() => setActivePanel(null)}
          aria-label="Close panel"
          className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--cw-text-muted)] hover:bg-[var(--cw-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cw-available)]"
        >
          ✕
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {(activePanel === "questions" || activePanel === "whatif") && props.template.questions.length === 0 && (
          <p className="text-xs text-[var(--cw-text-muted)]" data-testid="no-questions">
            This journey is the same for everyone: no questions change it.
          </p>
        )}
        {activePanel === "questions" && props.template.questions.length > 0 && (
          <GuidedQuestions
            journey={props.journey}
            onAnswer={props.onFactChange}
            onOpenWhatIf={() => setActivePanel("whatif")}
          />
        )}
        {activePanel === "summary" && (
          <JourneySummaryCard journey={props.journey} template={props.template} facts={props.facts} summary={props.summary} />
        )}
        {activePanel === "whatif" && props.template.questions.length > 0 && (
          <WhatIfPanel
            template={props.template}
            facts={props.facts}
            lastChange={props.lastChange}
            lastTotals={props.lastTotals}
            onChange={props.onFactChange}
          />
        )}
        {activePanel === "documents" && <DocumentChecklist journey={props.journey} completed={props.completed} />}
        {activePanel === "visits" && <OfficeVisitsPanel journey={props.journey} completed={props.completed} />}
      </div>
    </aside>
  );
}
