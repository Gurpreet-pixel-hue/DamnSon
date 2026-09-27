"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { JourneyTemplate, ApprovalModule } from "@/lib/contract/schema";
import type { FactKey, FactValue, Facts } from "@/lib/contract/facts";
import { diffJourneys, type JourneyDiff } from "@/lib/graph/journeyDiff";
import { safeCompose, type SafeComposeResult } from "@/lib/graph/safeCompose";
import { fromJourney, type MetroVM } from "@/lib/graph/viewModel";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { useViewStore } from "@/lib/store/useViewStore";
import { deriveSummaryValues } from "@/components/hud/SummaryBar";
import { compareTotals, type TotalsChange } from "@/components/hud/totalsChange";
import { VerificationBanner } from "@/components/hud/VerificationBanner";
import { JourneyPanels } from "@/components/hud/JourneyPanels";
import { ChangeToast } from "@/components/hud/ChangeToast";
import { ConflictBanner } from "./ConflictBanner";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { WindowCard } from "./WindowCard";
import { RightDrawer } from "./RightDrawer";
import { useShareJourney } from "./useShareJourney";

export interface JourneyShellProps {
  initialBundle: {
    template: JourneyTemplate;
    modules: ApprovalModule[];
  };
}

const EMPTY_COMPLETED: string[] = [];

export function JourneyShell({ initialBundle }: JourneyShellProps) {
  const { template, modules } = initialBundle;
  const taskId = template.taskId;

  // Rehydrate store on mount (P3 & C3)
  useEffect(() => {
    void useTaskStore.persist.rehydrate();
    useTaskStore.getState().setActiveTask(taskId);
  }, [taskId]);

  const factsByTask = useTaskStore((s) => s.factsByTask);
  const completedByTask = useTaskStore((s) => s.completedByTask);

  const facts = useMemo(() => factsByTask[taskId] ?? {}, [factsByTask, taskId]);
  const completedList = completedByTask[taskId] ?? EMPTY_COMPLETED;
  const completed = useMemo(() => new Set(completedList), [completedList]);

  // Compose journey on (template, modules, facts)
  const composeResult = useMemo<SafeComposeResult>(() => {
    return safeCompose(template, modules, facts);
  }, [template, modules, facts]);

  const journey = composeResult.ok ? composeResult.journey : undefined;

  // Answering or changing a fact: recompose once to report which stations were added / removed (PRD §5 F3)
  const [lastChange, setLastChange] = useState<JourneyDiff | null>(null);
  const [lastTotals, setLastTotals] = useState<TotalsChange[]>([]);
  const [toastChange, setToastChange] = useState<JourneyDiff | null>(null);
  const [changeVersion, setChangeVersion] = useState(0);
  const applyFact = useCallback(
    (fact: FactKey, value: FactValue | undefined) => {
      const nextFacts: Facts = { ...facts };
      if (value === undefined) delete nextFacts[fact];
      else nextFacts[fact] = value;
      const next = safeCompose(template, modules, nextFacts);
      if (journey && next.ok) {
        const diff = diffJourneys(journey, next.journey);
        setLastChange(diff);
        setLastTotals(
          compareTotals(deriveSummaryValues(journey, completed), deriveSummaryValues(next.journey, completed))
        );
        setToastChange(diff);
        setChangeVersion((v) => v + 1);
      }
      const store = useTaskStore.getState();
      if (value === undefined) store.clearFact(taskId, fact);
      else store.setFact(taskId, fact, value);
    },
    [completed, facts, journey, modules, taskId, template]
  );
  const dismissToast = useCallback(() => setToastChange(null), []);

  // Memoize MetroVM on (composed journey, completed)
  const metro = useMemo<MetroVM | null>(() => {
    if (!journey) return null;
    return fromJourney(journey, completed);
  }, [journey, completed]);

  // Derive 4 summary tile values
  const summary = useMemo(() => {
    if (!journey) {
      return {
        feeSummary: {
          minINR: 0,
          maxINR: 0,
          unconfirmedCount: 0,
          mayApplyCount: 0,
          annualMinINR: 0,
          annualMaxINR: 0,
          annualUnconfirmedCount: 0,
          conditionalMaxINR: 0,
        },
        timeSummary: {
          minDays: 0,
          maxDays: 0,
          openEnded: false,
          unknownCount: 0,
          criticalStepIds: [],
          relativeTo: null,
        },
        trips: [],
        nextUpIds: [],
        nextUpText: "Loading...",
        feesText: "Free",
        timeText: "Immediate",
        officeVisitsText: "No office visits",
        nextUpTile: { value: "Loading...", fullText: "Loading..." },
        feesTile: { value: "Free", fullText: "Free" },
        timeTile: { value: "Immediate", fullText: "Immediate" },
        visitsTile: { value: "No office visits", fullText: "No office visits" },
      };
    }
    return deriveSummaryValues(journey, completed);
  }, [journey, completed]);

  // Share and conflict handling (P3 & P4)
  const {
    copied,
    conflictSharedState,
    shareLink,
    applyShared,
    keepMine,
  } = useShareJourney(taskId, journey);

  // Development-only ?nowebgl=1 fallback hook
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get("nowebgl") === "1") {
        useViewStore.getState().setViewMode("2d");
        useViewStore
          .getState()
          .setWebglFallbackReason(
            "WebGL is unavailable or disabled. Switched to 2D flowchart view."
          );
      }
    }
  }, []);

  return (
    <div
      data-testid="journey-shell"
      className="h-[100dvh] max-h-[100dvh] overflow-hidden bg-[var(--cw-background)] text-[var(--cw-text)] flex flex-col p-4 gap-4 box-border"
    >
      {/* 72px Top Bar */}
      <TopBar
        template={template}
        metro={metro}
        summary={summary}
        copied={copied}
        onShare={() => void shareLink()}
      />

      {/* Notifications / Banners container (auto height) */}
      <div className="shrink-0 flex flex-col gap-2 empty:hidden">
        {/* Verification notice banner (P2) */}
        {journey && <VerificationBanner journey={journey} />}

        {/* Share conflict resolution banner (P3 & P4) */}
        {conflictSharedState && (
          <ConflictBanner
            sharedState={conflictSharedState}
            onApply={applyShared}
            onKeepMine={keepMine}
          />
        )}
      </div>

      {/* Main Shell Row: Rail, Framed 3D Window, Docked Drawer */}
      <div className="flex-1 min-h-0 flex gap-4 relative">
        {/* Left Rail */}
        <LeftRail questionCount={journey?.questions.length ?? 0} hasQuestions={template.questions.length > 0} />

        {/* Docked side panel: questions, summary, what-if, documents */}
        {journey && (
          <JourneyPanels
            journey={journey}
            template={template}
            facts={facts}
            completed={completed}
            summary={summary}
            lastChange={lastChange}
            lastTotals={lastTotals}
            onFactChange={applyFact}
          />
        )}

        {/* Framed 3D Window Card */}
        <WindowCard metro={metro} />

        {/* Right Docked / Overlay Drawer (P11) */}
        <RightDrawer journey={journey} />
      </div>

      <ChangeToast change={toastChange} version={changeVersion} onDismiss={dismissToast} />
    </div>
  );
}
