"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { safeCompose, type SafeComposeResult } from "@/lib/graph/safeCompose";
import { fromJourney, type MetroVM } from "@/lib/graph/viewModel";
import type { JourneyBundle } from "@/app/loadJourney";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { SearchBar } from "@/components/hud/SearchBar";
import { ViewModeToggle } from "@/components/hud/ViewModeToggle";
import { NodeDetailsDrawer } from "@/components/hud/NodeDetailsDrawer";
import { ProgressTracker } from "@/components/hud/ProgressTracker";
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
      <div className="flex h-full w-full items-center justify-center bg-[#09090b] text-sm text-zinc-500">
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
      <div className="flex h-full w-full items-center justify-center bg-[#09090b] text-sm text-zinc-500">
        Loading 2D Flowchart...
      </div>
    ),
  }
);

interface ExplorerShellProps {
  initialBundle?: JourneyBundle | null;
}

function subscribeDebugParam(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getDebugSnapshot(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function getDebugServerSnapshot(): boolean {
  return false;
}

function DebugOverlay() {
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
      className="pointer-events-auto absolute bottom-4 left-4 z-30 flex items-center gap-3 rounded-lg border border-cyan-500/30 bg-zinc-950/90 px-3 py-2 font-mono text-xs text-cyan-300 shadow-2xl backdrop-blur-md"
    >
      <div>
        <span className="text-zinc-500">scene draws:</span>{" "}
        <span className="font-semibold text-zinc-100">{metrics.sceneDraws}</span>
      </div>
      <div className="h-3 w-px bg-white/20" />
      <div>
        <span className="text-zinc-500">frame calls:</span>{" "}
        <span className="font-semibold text-zinc-100">{metrics.frameCalls}</span>
      </div>
      <div className="h-3 w-px bg-white/20" />
      <div>
        <span className="text-zinc-500">fps:</span>{" "}
        <span className="font-semibold text-emerald-400">{metrics.fps}</span>
      </div>
    </div>
  );
}

const EMPTY_COMPLETED: string[] = [];

export function ExplorerShell({ initialBundle }: ExplorerShellProps) {
  const viewMode = useViewStore((s) => s.viewMode);
  const webglFallbackReason = useViewStore((s) => s.webglFallbackReason);

  // C3: Rehydrate once on mount
  useEffect(() => {
    void useTaskStore.persist.rehydrate();
    if (initialBundle) {
      useTaskStore.getState().setActiveTask(initialBundle.template.taskId);
    }
  }, [initialBundle]);

  useEffect(() => {
    if (
      process.env.NODE_ENV === "development" &&
      typeof window !== "undefined"
    ) {
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

  const factsByTask = useTaskStore((s) => s.factsByTask);
  const completedByTask = useTaskStore((s) => s.completedByTask);

  const taskId = initialBundle?.template.taskId ?? "";
  const facts = useMemo(
    () => (taskId ? factsByTask[taskId] : undefined) ?? {},
    [taskId, factsByTask]
  );
  const completedList =
    (taskId ? completedByTask[taskId] : undefined) ?? EMPTY_COMPLETED;
  const completed = useMemo(() => new Set(completedList), [completedList]);

  // C2 / Phase 0: Memoise composed journey on (template.revision, facts) via safeCompose
  const template = initialBundle?.template;
  const modules = initialBundle?.modules;
  const templateRevision = template?.revision;

  const composeResult = useMemo<SafeComposeResult | { ok: true; journey?: undefined }>(() => {
    if (!template || !modules || templateRevision === undefined) return { ok: true };
    return safeCompose(template, modules, facts);
  }, [template, modules, templateRevision, facts]);

  // C2: Memoise MetroVM on (composed journey, completed)
  const journey = composeResult.ok ? composeResult.journey : undefined;
  const metro = useMemo<MetroVM | null>(() => {
    if (!journey) return null;
    return fromJourney(journey, completed);
  }, [journey, completed]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#09090b]">
      {/* Top HUD Overlay */}
      <header className="pointer-events-none absolute top-4 inset-x-4 z-20 flex items-center justify-between gap-4">
        <div className="pointer-events-auto flex-1 max-w-xl">
          <SearchBar />
        </div>
        <div className="pointer-events-auto">
          <ViewModeToggle />
        </div>
      </header>

      {/* Fallback Notice Banner */}
      {webglFallbackReason && (
        <div
          data-testid="webgl-fallback-notice"
          className="pointer-events-auto absolute top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-zinc-950/90 px-4 py-2 text-xs font-medium text-amber-300 shadow-2xl backdrop-blur-md"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span>{webglFallbackReason}</span>
        </div>
      )}

      {/* Main View Area */}
      <main
        data-testid="view-root"
        data-view={viewMode}
        className="h-full w-full"
      >
        {!composeResult.ok ? (
          // C2 / Phase 0: Render error state with issue codes and message instead of map
          <div
            data-testid="composition-error"
            className="flex h-full w-full flex-col items-center justify-center p-6 text-center"
          >
            <div className="max-w-md rounded-2xl border border-red-500/30 bg-zinc-950/80 p-8 shadow-2xl backdrop-blur-md">
              <h2 className="text-lg font-semibold text-red-400">
                Journey Composition Failed
              </h2>
              {composeResult.message ? (
                <p className="mt-2 text-xs font-mono text-zinc-300 break-words">
                  {composeResult.message}
                </p>
              ) : (
                <p className="mt-2 text-xs text-zinc-400">
                  The civic procedure could not be assembled due to contract validation errors:
                </p>
              )}
              <ul className="mt-4 space-y-1 text-xs font-mono text-amber-300">
                {composeResult.codes?.map((code, idx) => (
                  <li
                    key={idx}
                    className="rounded border border-red-500/20 bg-red-950/40 px-2 py-1"
                  >
                    {code}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : !initialBundle || !metro ? (
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
            <div className="max-w-md rounded-2xl border border-white/10 bg-zinc-950/80 p-8 shadow-2xl backdrop-blur-md">
              <h2 className="text-lg font-semibold text-zinc-100">
                No published journeys yet
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                Search or load a verified municipal journey from the repository
                to begin exploring the Civic Metro.
              </p>
            </div>
          </div>
        ) : viewMode === "3d" ? (
          <SceneContainer metro={metro} />
        ) : (
          <FlowchartView />
        )}
      </main>

      {/* Floating HUD Side Elements */}
      <aside className="pointer-events-none absolute bottom-4 right-6 z-20">
        <div className="pointer-events-auto">
          <ProgressTracker metro={metro} />
        </div>
      </aside>

      <NodeDetailsDrawer />
      <DebugOverlay />
    </div>
  );
}
