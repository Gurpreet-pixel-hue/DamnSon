"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CivicTaskGraph } from "@/lib/graph/schema";
import { resolvePath } from "@/lib/graph/resolvePath";
import { fromV2 } from "@/lib/graph/viewModel";
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
  initialGraph?: CivicTaskGraph | null;
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

const EMPTY_ANSWERS: Record<string, boolean> = {};
const EMPTY_COMPLETED: string[] = [];

export function ExplorerShell({ initialGraph }: ExplorerShellProps) {
  const viewMode = useViewStore((s) => s.viewMode);
  const webglFallbackReason = useViewStore((s) => s.webglFallbackReason);

  useEffect(() => {
    void useTaskStore.persist.rehydrate();
    if (initialGraph) {
      useTaskStore.getState().setActiveTask(initialGraph.taskId);
    }
  }, [initialGraph]);

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

  const answersByTask = useTaskStore((s) => s.answersByTask);
  const completedByTask = useTaskStore((s) => s.completedByTask);

  const taskId = initialGraph?.taskId ?? "";
  const answers = (taskId ? answersByTask[taskId] : undefined) ?? EMPTY_ANSWERS;
  const completedList =
    (taskId ? completedByTask[taskId] : undefined) ?? EMPTY_COMPLETED;
  const completed = useMemo(() => new Set(completedList), [completedList]);

  const metro = useMemo(() => {
    if (!initialGraph) return null;
    const resolved = resolvePath(initialGraph, answers);
    return fromV2(resolved, completed);
  }, [initialGraph, answers, completed]);

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
        {!initialGraph || !metro ? (
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
