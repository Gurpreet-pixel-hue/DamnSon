"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { SearchBar } from "@/components/hud/SearchBar";
import { ViewModeToggle } from "@/components/hud/ViewModeToggle";
import { NodeDetailsDrawer } from "@/components/hud/NodeDetailsDrawer";
import { ProgressTracker } from "@/components/hud/ProgressTracker";

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

export function ExplorerShell() {
  const viewMode = useViewStore((s) => s.viewMode);

  useEffect(() => {
    void useTaskStore.persist.rehydrate();
  }, []);

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

      {/* Main View Area */}
      <main className="h-full w-full">
        {viewMode === "3d" ? <SceneContainer /> : <FlowchartView />}
      </main>

      {/* Floating HUD Side Elements */}
      <aside className="pointer-events-none absolute bottom-4 right-4 z-20">
        <div className="pointer-events-auto">
          <ProgressTracker />
        </div>
      </aside>

      <NodeDetailsDrawer />
    </div>
  );
}
