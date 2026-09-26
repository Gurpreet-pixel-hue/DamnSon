"use client";

import { useMemo } from "react";
import { Html } from "@react-three/drei";
import type { MetroVM, StationVM } from "@/lib/graph/viewModel";
import { useViewStore } from "@/lib/store/useViewStore";
import { Badge } from "@/components/ui/badge";

interface StationLabelsProps {
  metro: MetroVM;
}

export function StationLabels({ metro }: StationLabelsProps) {
  const hoveredStepId = useViewStore((s) => s.hoveredStepId);
  const focusedStepId = useViewStore((s) => s.focusedStepId);

  // Active labels: hovered, focused, and next-up (up to 6 total)
  const activeStations = useMemo(() => {
    const stationMap = new Map<string, StationVM>(
      metro.stations.map((s) => [s.id, s])
    );
    const selectedIds = new Set<string>();

    if (hoveredStepId && stationMap.has(hoveredStepId)) {
      selectedIds.add(hoveredStepId);
    }
    if (focusedStepId && stationMap.has(focusedStepId)) {
      selectedIds.add(focusedStepId);
    }

    // Add next-up (available non-optional) stations
    for (const station of metro.stations) {
      if (selectedIds.size >= 6) break;
      if (
        station.state === "available" &&
        station.applicability !== "optional"
      ) {
        selectedIds.add(station.id);
      }
    }

    const list: StationVM[] = [];
    for (const id of selectedIds) {
      const s = stationMap.get(id);
      if (s) list.push(s);
    }
    return list;
  }, [metro, hoveredStepId, focusedStepId]);

  return (
    <group>
      {activeStations.map((station) => {
        const [x, y, z] = station.position3D;
        const isHovered = station.id === hoveredStepId;
        const isFocused = station.id === focusedStepId;

        let stateColor = "text-zinc-400 border-zinc-700 bg-zinc-800/60";
        let stateLabel: string = station.state;
        if (station.applicability === "may_apply") {
          stateColor = "text-amber-400 border-amber-500/40 bg-amber-950/40";
          stateLabel = "may apply";
        } else if (station.state === "available") {
          stateColor = "text-cyan-400 border-cyan-500/40 bg-cyan-950/40";
        } else if (station.state === "done") {
          stateColor = "text-emerald-400 border-emerald-500/40 bg-emerald-950/40";
        }

        return (
          <Html
            key={station.id}
            position={[x, y + 1.8, z]}
            center
            distanceFactor={18}
            className="pointer-events-none select-none"
          >
            <div
              className={`flex flex-col items-center gap-1 rounded-lg border bg-zinc-950/90 p-2 shadow-2xl backdrop-blur-md transition-all ${
                isFocused
                  ? "border-cyan-400 ring-2 ring-cyan-400/30 scale-105"
                  : isHovered
                  ? "border-white/30 scale-100"
                  : "border-white/10 opacity-90 scale-95"
              }`}
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-xs font-semibold text-zinc-100">
                  {station.title}
                </span>
                {station.badge && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {station.badge}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={`inline-flex items-center rounded-full border px-1.5 py-0.2 text-[10px] font-medium capitalize ${stateColor}`}
                >
                  {stateLabel}
                </span>
                {station.officeType && (
                  <span className="text-[10px] text-zinc-400">
                    {station.officeType.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            </div>
          </Html>
        );
      })}
    </group>
  );
}
