"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { JourneyTemplate, ApprovalModule } from "@/lib/contract/schema";
import type { ComposedJourney } from "@/lib/contract/compose";
import { safeCompose, type SafeComposeResult } from "@/lib/graph/safeCompose";
import { fromJourney, type MetroVM } from "@/lib/graph/viewModel";
import { currentStage } from "@/lib/graph/stages";
import { diffJourneys, formatDiff, clampFocusStage, type JourneyDiff } from "@/lib/graph/journeyDiff";
import { compareTotals, type TotalsChange } from "@/components/hud/totalsChange";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { useViewStore } from "@/lib/store/useViewStore";
import { deriveSummaryValues, type JourneySummaryValues } from "@/components/hud/SummaryBar";
import { VerificationBanner } from "@/components/hud/VerificationBanner";
import { ConflictBanner } from "./ConflictBanner";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { WindowCard } from "./WindowCard";
import { RightDrawer } from "./RightDrawer";
import { UndoToast } from "./UndoToast";
import { useShareJourney } from "./useShareJourney";
import { startEntranceSession } from "@/components/canvas/entrance/entranceState";

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

  // Rehydrate store and initialize entrance session on mount (P3, C3, A13)
  useEffect(() => {
    void useTaskStore.persist.rehydrate();
    useTaskStore.getState().setActiveTask(taskId);
    startEntranceSession();
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

  // Recompose diff detection & toast (PRD §8.6 & Amendment 4 & C4)
  const prevJourneyRef = useRef<ComposedJourney | null>(null);
  const [lastDiff, setLastDiff] = useState<JourneyDiff | null>(null);
  const [lastTotals, setLastTotals] = useState<TotalsChange[]>([]);

  useEffect(() => {
    if (journey) {
      if (prevJourneyRef.current !== null) {
        const diff = diffJourneys(prevJourneyRef.current, journey);
        const toastMsg = formatDiff(diff);
        if (toastMsg) {
          useViewStore.getState().showRecomposeToast(toastMsg);
        }
        setLastDiff(diff);
      }
      prevJourneyRef.current = journey;
    }
  }, [journey]);

  // Memoize MetroVM on (composed journey, completed)
  const metro = useMemo<MetroVM | null>(() => {
    if (!journey) return null;
    return fromJourney(journey, completed);
  }, [journey, completed]);

  // Clamp focusStage if the focused stage disappeared after recompose (Amendment 4)
  useEffect(() => {
    if (metro && metro.stations.length > 0) {
      const currentFocus = useViewStore.getState().focusStage;
      const clamped = clampFocusStage(currentFocus, metro);
      if (clamped !== currentFocus) {
        useViewStore.getState().setFocusStage(clamped);
      }
    }
  }, [metro]);

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

  const prevSummaryRef = useRef<JourneySummaryValues | null>(null);
  useEffect(() => {
    if (summary) {
      if (prevSummaryRef.current !== null) {
        const totalsDiff = compareTotals(prevSummaryRef.current, summary);
        if (totalsDiff.length > 0) {
          setLastTotals(totalsDiff);
        }
      }
      prevSummaryRef.current = summary;
    }
  }, [summary]);

  // Share and conflict handling (P3 & P4)
  const {
    copied,
    conflictSharedState,
    shareLink,
    applyShared,
    keepMine,
  } = useShareJourney(taskId, journey);

  // Auto-switch to 2D view below 1024px with advisory note (Amendment 6 & PRD §11.3)
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== "undefined") {
        if (window.innerWidth < 1024) {
          useViewStore.getState().setViewMode("2d");
          useViewStore
            .getState()
            .setWebglFallbackReason(
              "Best experienced on a laptop (≥1024px). Switched to 2D view."
            );
        }
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  // On load, focusStage = currentStage(metro) (§11.1)
  const initialStageRef = useRef(false);
  useEffect(() => {
    if (metro && metro.stations.length > 0 && !initialStageRef.current) {
      initialStageRef.current = true;
      const initial = currentStage(metro);
      useViewStore.getState().setFocusStage(initial);
    }
  }, [metro]);

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

      {/* Main Shell Row: Rail, Framed 3D/2D Window with Overlay Drawer (§11.3) */}
      <div className="flex-1 min-h-0 flex gap-4 relative overflow-hidden">
        {/* Left Rail (Holds navigation + Your situation panel) */}
        <LeftRail
          template={template}
          modules={modules}
          journey={journey}
          lastChange={lastDiff}
          lastTotals={lastTotals}
        />

        {/* Framed 3D / 2D Window Card with internal Overlay Drawer */}
        <WindowCard
          metro={metro}
          journey={journey}
          template={template}
          facts={facts}
          completed={completed}
          summary={summary}
          drawer={<RightDrawer journey={journey} />}
        />
      </div>

      {/* Undo and Recompose Toasts */}
      <UndoToast />
    </div>
  );
}
