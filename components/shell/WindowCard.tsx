"use client";

import React, { useRef, useState, useEffect, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { MetroVM } from "@/lib/graph/viewModel";
import { useViewStore } from "@/lib/store/useViewStore";
import { Legend } from "@/components/canvas/Legend";
import {
  currentDebugMetrics,
  subscribeDebugMetrics,
  type SceneDebugMetrics,
} from "@/components/canvas/MetroScene";

const SceneContainer = dynamic(
  () => import("@/components/canvas/SceneContainer"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[var(--cw-background)] text-xs text-[var(--cw-text-muted)]">
        Loading 3D Canvas...
      </div>
    ),
  }
);

const FlowchartView = dynamic(
  () => import("@/components/graph-2d/FlowchartView"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[var(--cw-background)] text-xs text-[var(--cw-text-muted)]">
        Loading 2D Flowchart...
      </div>
    ),
  }
);

function subscribeDebugParam(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getDebugSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function getDebugServerSnapshot(): boolean {
  return false;
}

function CardDebugOverlay() {
  const [metrics, setMetrics] = useState<SceneDebugMetrics>(currentDebugMetrics);
  const showDebug = useSyncExternalStore(
    subscribeDebugParam,
    getDebugSnapshot,
    getDebugServerSnapshot
  );

  useEffect(() => {
    if (!showDebug) return;
    return subscribeDebugMetrics((m) => {
      setMetrics({ ...m });
    });
  }, [showDebug]);

  if (!showDebug) return null;

  return (
    <div
      data-testid="debug-overlay"
      className="pointer-events-auto absolute bottom-[60px] left-4 z-30 flex items-center gap-3 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-surface)]/95 px-3 py-2 font-mono text-xs text-[var(--cw-text)] shadow-lg backdrop-blur-md"
    >
      <div>
        <span className="text-[var(--cw-text-muted)]">scene draws:</span>{" "}
        <span className="font-semibold text-[var(--cw-text)]">{metrics.sceneDraws}</span>
      </div>
      <div className="h-3 w-px bg-[var(--cw-border)]" />
      <div>
        <span className="text-[var(--cw-text-muted)]">frame calls:</span>{" "}
        <span className="font-semibold text-[var(--cw-text)]">{metrics.frameCalls}</span>
      </div>
      <div className="h-3 w-px bg-[var(--cw-border)]" />
      <div>
        <span className="text-[var(--cw-text-muted)]">scene tris:</span>{" "}
        <span className="font-semibold text-[var(--cw-text)]">{metrics.sceneTris.toLocaleString()}</span>
      </div>
      <div className="h-3 w-px bg-[var(--cw-border)]" />
      <div>
        <span className="text-[var(--cw-text-muted)]">frame tris:</span>{" "}
        <span className="font-semibold text-[var(--cw-text)]">{metrics.frameTris.toLocaleString()}</span>
      </div>
      <div className="h-3 w-px bg-[var(--cw-border)]" />
      <div>
        <span className="text-[var(--cw-text-muted)]">fps:</span>{" "}
        <span className="font-semibold text-[#1E7F3B]">{metrics.fps}</span>
      </div>
    </div>
  );
}

import { StageStepper } from "@/components/canvas/StageStepper";

export interface WindowCardProps {
  metro: MetroVM | null;
  drawer?: React.ReactNode;
  className?: string;
}

export function WindowCard({ metro, drawer, className = "" }: WindowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const stepperContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const viewMode = useViewStore((s) => s.viewMode);
  const setViewMode = useViewStore((s) => s.setViewMode);
  const criticalPathOn = useViewStore((s) => s.criticalPathOn);
  const toggleCriticalPath = useViewStore((s) => s.toggleCriticalPath);
  const wholeRouteView = useViewStore((s) => s.wholeRouteView);
  const toggleWholeRouteView = useViewStore((s) => s.toggleWholeRouteView);

  // Monitor fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === cardRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Measure stepper rect relative to canvas container (§11.8):
  // bottom inset = canvasBottom − stepperTop + 16
  useEffect(() => {
    const measureStepper = () => {
      if (!cardRef.current || !stepperContainerRef.current) return;
      const canvasEl = cardRef.current.querySelector("canvas") || cardRef.current;
      const canvasRect = canvasEl.getBoundingClientRect();
      const stepperRect = stepperContainerRef.current.getBoundingClientRect();
      if (canvasRect.height > 0 && stepperRect.height > 0) {
        const bottomInset = Math.max(
          80,
          Math.round(canvasRect.bottom - stepperRect.top + 16)
        );
        useViewStore.getState().setStepperBottomInset(bottomInset);
      }
    };

    measureStepper();
    const ro = new ResizeObserver(measureStepper);
    if (stepperContainerRef.current) ro.observe(stepperContainerRef.current);
    if (cardRef.current) ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, [metro]);

  const toggleFullscreen = () => {
    if (!cardRef.current) return;
    if (!document.fullscreenElement) {
      void cardRef.current.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  return (
    <div
      ref={cardRef}
      data-testid="3d-window-card"
      className={`relative flex-1 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] shadow-xs overflow-hidden flex flex-col h-full min-h-[480px] ${className}`}
    >
      {/* Stage-header band (56px inside top of card) */}
      <div
        data-testid="stage-header-band"
        className="pointer-events-none absolute top-0 inset-x-0 h-14 z-10"
      />

      {/* Main viewport canvas area */}
      <div className="relative flex-1 w-full overflow-hidden bg-[var(--cw-background)]">
        {viewMode === "3d" ? (
          metro && <SceneContainer metro={metro} />
        ) : (
          <FlowchartView />
        )}

        {/* Debug overlay inside card, bottom-left */}
        <CardDebugOverlay />

        {/* Stage Stepper, bottom center (§11.1) */}
        {metro && (
          <div
            ref={stepperContainerRef}
            className="pointer-events-none absolute bottom-[60px] left-1/2 -translate-x-1/2 z-30"
          >
            <StageStepper metro={metro} />
          </div>
        )}

        {/* Overlay Drawer (§11.3) */}
        {drawer}
      </div>

      {/* Card Footer (52px) */}
      <footer
        data-testid="card-footer"
        className="h-[52px] shrink-0 border-t border-[var(--cw-border)] bg-[var(--cw-surface)] px-4 flex items-center justify-between gap-4 z-20 select-none"
      >
        {/* Left: Legend */}
        <div className="flex items-center overflow-x-auto py-1">
          <Legend />
        </div>

        {/* Right: Controls (Critical path, Whole route, 3D/2D, Fullscreen) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Critical Path Toggle */}
          <button
            type="button"
            data-testid="footer-critical-path-toggle"
            onClick={toggleCriticalPath}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              criticalPathOn
                ? "border-[#D92D20]/40 bg-[#D92D20]/15 text-[#D92D20]"
                : "border-[var(--cw-border)] bg-[var(--cw-background)] text-[var(--cw-text-muted)] hover:text-[var(--cw-text)]"
            }`}
            aria-pressed={criticalPathOn}
          >
            Critical Path
          </button>

          {/* Whole Route Toggle Button (§11.3) */}
          <button
            type="button"
            data-testid="footer-whole-route-toggle"
            onClick={toggleWholeRouteView}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              wholeRouteView
                ? "border-[var(--cw-brand)] bg-[var(--cw-brand)]/15 text-[var(--cw-brand)] font-semibold"
                : "border-[var(--cw-border)] bg-[var(--cw-background)] text-[var(--cw-text-muted)] hover:text-[var(--cw-text)]"
            }`}
            aria-pressed={wholeRouteView}
            title={wholeRouteView ? "Return to stage framing" : "Fit whole route"}
          >
            Whole route
          </button>

          {/* 3D / 2D Toggle */}
          <div className="flex items-center rounded-lg border border-[var(--cw-border)] bg-[var(--cw-background)] p-0.5 text-xs">
            <button
              type="button"
              data-testid="footer-toggle-3d"
              onClick={() => setViewMode("3d")}
              className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                viewMode === "3d"
                  ? "bg-[var(--cw-surface)] text-[var(--cw-text)] shadow-xs"
                  : "text-[var(--cw-text-muted)] hover:text-[var(--cw-text)]"
              }`}
            >
              3D
            </button>
            <button
              type="button"
              data-testid="footer-toggle-2d"
              aria-disabled="true"
              title="2D view arrives with FE-4"
              onClick={(e) => {
                e.preventDefault();
                // 2D view arrives with FE-4: clicking it does nothing
              }}
              className="px-2 py-0.5 rounded-md font-semibold text-[var(--cw-text-muted)] cursor-not-allowed opacity-60 transition-colors"
            >
              2D
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            type="button"
            data-testid="footer-fullscreen-button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-background)] text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] hover:bg-[var(--cw-border)]/20 transition-colors"
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 3h6v6" />
                <path d="M9 21H3v-6" />
                <path d="M21 3l-7 7" />
                <path d="M3 21l7-7" />
              </svg>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
