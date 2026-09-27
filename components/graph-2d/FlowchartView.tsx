"use client";

import React, { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { MetroVM } from "@/lib/graph/viewModel";
import { useViewStore, requestHover } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { useSceneKeyboard } from "@/components/canvas/useSceneKeyboard";
import { buildFlow2DGraph } from "@/lib/graph/flow2d";
import { StationNode } from "./StationNode";

export interface FlowchartViewProps {
  metro?: MetroVM | null;
}

const nodeTypes: NodeTypes = {
  station: StationNode,
};

const EMPTY_METRO: MetroVM = { stations: [], tracks: [] };

export default function FlowchartView({ metro = EMPTY_METRO }: FlowchartViewProps) {
  const activeMetro = metro ?? EMPTY_METRO;

  // Shared keyboard navigation per frontend-spec & Amendment 3
  useSceneKeyboard(activeMetro);

  const focusStage = useViewStore((s) => s.focusStage);
  const setFocusStage = useViewStore((s) => s.setFocusStage);
  const focusedStepId = useViewStore((s) => s.focusedStepId);
  const setFocusedStepId = useViewStore((s) => s.setFocusedStepId);
  const hoveredStepId = useViewStore((s) => s.hoveredStepId);
  const criticalPathOn = useViewStore((s) => s.criticalPathOn);
  const webglFallbackReason = useViewStore((s) => s.webglFallbackReason);

  const selectedStepId = useTaskStore((s) => s.selectedStepId);
  const selectStep = useTaskStore((s) => s.selectStep);

  const handleSelectStep = React.useCallback(
    (id: string) => {
      selectStep(id);
      setFocusedStepId(id);
      const station = activeMetro.stations.find((s) => s.id === id);
      if (station) {
        setFocusStage(station.layer + 1);
      }
    },
    [activeMetro, selectStep, setFocusedStepId, setFocusStage]
  );

  const { nodes, edges } = useMemo(() => {
    return buildFlow2DGraph(activeMetro, {
      focusStage,
      selectedStepId: selectedStepId ?? focusedStepId,
      hoveredStepId,
      criticalPathOn,
      onSelectStep: handleSelectStep,
      onHoverStep: requestHover,
    });
  }, [
    activeMetro,
    focusStage,
    selectedStepId,
    focusedStepId,
    hoveredStepId,
    criticalPathOn,
    handleSelectStep,
  ]);

  if (activeMetro.stations.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--cw-background)] text-xs text-[var(--cw-text-muted)]">
        No graph to display in 2D
      </div>
    );
  }

  return (
    <div
      data-testid="flowchart-view"
      className="relative h-full w-full bg-[var(--cw-background)] overflow-hidden"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background color="#E4DACA" gap={20} size={1.5} />
        <Controls showInteractive={false} className="!bottom-4 !right-4" />
      </ReactFlow>

      {/* Advisory notice when 2D view is triggered via fallback / resize (PRD §11.3 & Amendment 6) */}
      {webglFallbackReason && (
        <div
          data-testid="webgl-fallback-notice"
          className="pointer-events-none absolute top-3 left-4 z-30 max-w-[380px] rounded-lg border border-[var(--cw-border)] bg-[var(--cw-surface)]/95 px-3 py-1.5 text-[11px] font-medium text-[var(--cw-text-muted)] shadow-sm backdrop-blur-md"
        >
          {webglFallbackReason}
        </div>
      )}
    </div>
  );
}
