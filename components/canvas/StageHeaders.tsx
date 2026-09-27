"use client";

import { useMemo } from "react";
import type { MetroVM } from "@/lib/graph/viewModel";
import { computeBoardBounds } from "./city/planCity";

export const MAX_HEADER_SLOTS = 16;

export interface StageHeaderItem {
  layer: number;
  text: string;
  x: number;
  z: number;
}

export function deriveStageHeaders(metro: MetroVM): StageHeaderItem[] {
  if (metro.stations.length === 0) return [];

  const bounds = computeBoardBounds(
    metro.stations.map((s) => ({ id: s.id, position3D: s.position3D }))
  );
  const backZ = bounds.minZ + 1.2;
  const layerMap = new Map<number, number[]>();

  for (const s of metro.stations) {
    const xs = layerMap.get(s.layer) ?? [];
    xs.push(s.position3D[0]);
    layerMap.set(s.layer, xs);
  }

  const sortedLayers = Array.from(layerMap.keys()).sort((a, b) => a - b);

  return sortedLayers.slice(0, MAX_HEADER_SLOTS).map((layer) => {
    const xs = layerMap.get(layer)!;
    const avgX = xs.reduce((sum, val) => sum + val, 0) / xs.length;
    const count = xs.length;

    let text: string;
    if (layer === 0) {
      text = "1 · Start here";
    } else if (count > 1) {
      text = `${layer + 1} · In parallel (${count})`;
    } else {
      text = `${layer + 1} · Then`;
    }

    return {
      layer,
      text,
      x: avgX,
      z: backZ,
    };
  });
}

export interface StageHeadersProps {
  metro: MetroVM;
  slotsRef: React.RefObject<(HTMLDivElement | null)[]>;
}

export function StageHeaders({ metro, slotsRef }: StageHeadersProps) {
  const headers = useMemo(() => deriveStageHeaders(metro), [metro]);

  return (
    <div
      data-testid="stage-headers"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {Array.from({ length: MAX_HEADER_SLOTS }, (_, idx) => {
        const item = headers[idx];
        return (
          <div
            key={`stage-header-${idx}`}
            ref={(el) => {
              if (slotsRef.current) slotsRef.current[idx] = el;
            }}
            style={{
              visibility: "hidden",
              willChange: "transform",
            }}
            className="pointer-events-none absolute left-0 top-0 flex items-center justify-center rounded-full border border-[#D9C9A8] bg-[#FBF8F3]/95 px-3 py-1 text-[11px] font-semibold tracking-wider text-[#697586] shadow-sm uppercase whitespace-nowrap select-none"
          >
            {item ? item.text : ""}
          </div>
        );
      })}
    </div>
  );
}
