"use client";

import React, { useEffect, useMemo } from "react";
import type { JourneyTemplate, ApprovalModule } from "@/lib/contract/schema";
import { safeCompose, type SafeComposeResult } from "@/lib/graph/safeCompose";
import { fromJourney, type MetroVM } from "@/lib/graph/viewModel";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { useViewStore } from "@/lib/store/useViewStore";
import { deriveSummaryValues } from "@/components/hud/SummaryBar";
import { VerificationBanner } from "@/components/hud/VerificationBanner";
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
        <LeftRail />

        {/* Framed 3D Window Card */}
        <WindowCard metro={metro} />

        {/* Right Docked / Overlay Drawer (P11) */}
        <RightDrawer journey={journey} />
      </div>
    </div>
  );
}
