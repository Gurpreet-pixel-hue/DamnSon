"use client";

import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowStationNode } from "@/lib/graph/flow2d";

export const StationNode = memo(function StationNode({
  data,
  selected,
}: NodeProps<FlowStationNode>) {
  const { station, isFocusedStage, isSelected, isHovered, onSelect, onHover } =
    data;

  const isDone = station.state === "done";
  const isAvailable = station.state === "available";
  const isLocked = station.state === "locked";
  const isMayApply = station.applicability === "may_apply";
  const isMilestone = station.kind === "milestone";
  const isOnline = station.mode === "online";

  const getBorderAndBg = () => {
    if (isDone) return "border-[#1E7F3B] bg-[#1E7F3B]/5";
    if (isAvailable) return "border-[#1F63D6] bg-[#1F63D6]/5";
    if (isMayApply) return "border-dashed border-[#B45309] bg-[#B45309]/5";
    return "border-[var(--cw-border)] bg-[var(--cw-surface)]";
  };

  return (
    <div
      data-testid={`2d-station-node-${station.id}`}
      data-step-id={station.id}
      data-state={station.state}
      onClick={() => onSelect(station.id)}
      onMouseEnter={() => onHover(station.id)}
      onMouseLeave={() => onHover(null)}
      className={`w-[200px] h-[72px] rounded-xl border p-2 flex flex-col justify-between select-none cursor-pointer transition-all duration-150 relative box-border ${getBorderAndBg()} ${
        isFocusedStage
          ? "opacity-100 shadow-xs"
          : "opacity-45 hover:opacity-85 shadow-none"
      } ${
        isSelected || selected
          ? "ring-2 ring-[var(--cw-brand)] shadow-md"
          : isHovered
          ? "ring-1 ring-[var(--cw-brand)]/50"
          : ""
      }`}
    >
      {/* Input target handle on left */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !-left-1 !bg-[var(--cw-border)] !border-[var(--cw-surface)]"
      />

      {/* Top row: state glyph + mode badge */}
      <div className="flex items-center justify-between gap-1.5 pointer-events-none">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Status Indicator Icon */}
          {isDone ? (
            <svg
              className="w-3.5 h-3.5 text-[#1E7F3B] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-label="Done"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : isAvailable ? (
            <span
              className="w-2.5 h-2.5 rounded-full bg-[#1F63D6] ring-2 ring-[#1F63D6]/20 shrink-0 animate-pulse"
              aria-label="Available"
            />
          ) : isMayApply ? (
            <span
              className="w-2.5 h-2.5 rounded-full border border-dashed border-[#B45309] bg-amber-500/20 shrink-0"
              aria-label="May apply"
            />
          ) : (
            <svg
              className="w-3 h-3 text-[var(--cw-text-muted)] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-label="Locked"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          )}

          <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--cw-text-muted)] truncate">
            {isMilestone ? "Milestone" : isOnline ? "Online" : station.mode?.replace("_", " ") ?? "In person"}
          </span>
        </div>

        {/* Repeat badge or Stage badge */}
        {station.badge ? (
          <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/15 text-amber-800 shrink-0">
            {station.badge}
          </span>
        ) : (
          <span className="text-[9px] font-medium text-[var(--cw-text-muted)] shrink-0">
            S{station.layer + 1}
          </span>
        )}
      </div>

      {/* Middle: Title */}
      <div className="font-semibold text-xs text-[var(--cw-text)] tracking-tight leading-tight line-clamp-2 pointer-events-none">
        {station.title}
      </div>

      {/* Output source handle on right */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !-right-1 !bg-[var(--cw-border)] !border-[var(--cw-surface)]"
      />
    </div>
  );
});
