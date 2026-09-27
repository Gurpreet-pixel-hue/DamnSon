"use client";

import { useMemo } from "react";
import type { MetroVM } from "@/lib/graph/viewModel";

export const MAX_HEADER_SLOTS = 16;

export interface StageHeaderItem {
  layer: number;
  text: string;
  x: number;
  z: number;
}

export function deriveStageHeaders(metro: MetroVM): StageHeaderItem[] {
  if (metro.stations.length === 0) return [];

  let minZ = Infinity;
  const layerMap = new Map<number, number[]>();

  for (const s of metro.stations) {
    minZ = Math.min(minZ, s.position3D[2]);
    const xs = layerMap.get(s.layer) ?? [];
    xs.push(s.position3D[0]);
    layerMap.set(s.layer, xs);
  }

  const backZ = minZ - 2.0;

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

import { useViewStore } from "@/lib/store/useViewStore";
import { getStages } from "@/lib/graph/stages";

export interface StageHeadersProps {
  metro: MetroVM;
  slotsRef: React.RefObject<(HTMLDivElement | null)[]>;
}

export function StageHeaders({ metro, slotsRef }: StageHeadersProps) {
  const headers = useMemo(() => deriveStageHeaders(metro), [metro]);
  const stages = useMemo(() => getStages(metro), [metro]);
  const focusStage = useViewStore((s) => s.focusStage);
  const setFocusStage = useViewStore((s) => s.setFocusStage);

  const stageMap = useMemo(() => {
    const map = new Map<number, (typeof stages)[0]>();
    for (const st of stages) {
      map.set(st.layer, st);
    }
    return map;
  }, [stages]);

  return (
    <div
      data-testid="stage-headers"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {Array.from({ length: MAX_HEADER_SLOTS }, (_, idx) => {
        const item = headers[idx];
        if (!item) {
          return (
            <div
              key={`stage-header-${idx}`}
              ref={(el) => {
                if (slotsRef.current) slotsRef.current[idx] = el;
              }}
              style={{ visibility: "hidden" }}
              className="absolute left-0 top-0 pointer-events-none"
            />
          );
        }

        const stageNumber = item.layer + 1;
        const isFocused = focusStage === stageNumber;
        const stageInfo = stageMap.get(item.layer);
        const isDone = stageInfo?.isDone ?? false;

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
            data-testid={`stage-chip-${stageNumber}`}
            onClick={() => setFocusStage(stageNumber)}
            role="button"
            tabIndex={0}
            aria-label={`Focus stage ${stageNumber}: ${item.text}`}
            className={`pointer-events-auto cursor-pointer absolute left-0 top-0 flex items-center gap-1.5 justify-center rounded-full border px-3 py-1 text-[11px] tracking-wider uppercase whitespace-nowrap select-none transition-colors ${
              isFocused
                ? "border-[var(--cw-brand)] bg-[var(--cw-brand)] text-white font-bold shadow-md"
                : isDone
                ? "border-[#1E7F3B] bg-[#1E7F3B]/10 text-[#1E7F3B] font-semibold"
                : "border-[var(--cw-border)] bg-[var(--cw-surface)]/95 text-[var(--cw-text-muted)] font-medium shadow-xs hover:border-[var(--cw-text-muted)]"
            }`}
          >
            <span className="hidden [[data-pinned='left']>&]:inline font-bold text-xs mr-0.5">‹</span>
            <span className="hidden [[data-pinned='top']>&]:inline font-bold text-xs mr-0.5">▲</span>
            {isDone && !isFocused && (
              <svg
                className="h-3 w-3 text-[#1E7F3B]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <span>{item.text}</span>
            <span className="hidden [[data-pinned='right']>&]:inline font-bold text-xs ml-0.5">›</span>
            <span className="hidden [[data-pinned='bottom']>&]:inline font-bold text-xs ml-0.5">▼</span>
          </div>
        );
      })}
    </div>
  );
}
