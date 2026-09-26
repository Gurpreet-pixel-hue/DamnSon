"use client";

import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export default function FlowchartView() {
  return (
    <div className="relative h-full w-full bg-[#09090b]">
      <ReactFlow nodes={[]} edges={[]} colorMode="dark" fitView>
        <Background color="#27272a" gap={16} />
        <Controls />
      </ReactFlow>
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-md border border-white/10 bg-zinc-950/60 px-2 py-1 text-xs text-zinc-400 backdrop-blur-xs">
        2D Flowchart View Placeholder
      </div>
    </div>
  );
}
