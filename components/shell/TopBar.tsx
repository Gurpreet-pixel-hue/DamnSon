"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import type { JourneyTemplate } from "@/lib/contract/schema";
import type { MetroVM } from "@/lib/graph/viewModel";
import { computeProgressCount } from "@/lib/graph/progress";
import type { JourneySummaryValues } from "@/components/hud/SummaryBar";
import { SummaryTile } from "@/components/hud/SummaryBar";

export interface TopBarProps {
  template: JourneyTemplate;
  metro?: MetroVM | null;
  summary: JourneySummaryValues;
  copied: boolean;
  onShare: () => void;
  className?: string;
}

export function TopBar({
  template,
  metro,
  summary,
  copied,
  onShare,
  className = "",
}: TopBarProps) {
  const { total, done } = useMemo(() => computeProgressCount(metro), [metro]);
  const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;

  const locationText = template.jurisdiction.city
    ? `${template.jurisdiction.city}, ${template.jurisdiction.state}`
    : template.jurisdiction.state;

  return (
    <header
      data-testid="top-bar"
      className={`h-[72px] shrink-0 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] px-4 sm:px-6 flex items-center justify-between gap-3 shadow-xs select-none ${className}`}
    >
      {/* Brand & Mark */}
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2.5 group"
          aria-label="CivicWeave Home"
        >
          <svg
            className="w-8 h-8 shrink-0 transition-transform group-hover:scale-105"
            viewBox="0 0 32 32"
            fill="none"
            aria-label="CivicWeave Mark"
          >
            <path
              d="M4 9h24M8 16h20M4 23h24"
              stroke="var(--cw-brand)"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <path
              d="M12 4v24M20 4v24"
              stroke="var(--cw-available)"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </svg>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-[var(--cw-text)] leading-none">
              CivicWeave
            </span>
            <span className="text-[9px] uppercase tracking-widest text-[var(--cw-text-muted)] font-medium mt-1">
              Your city. In order.
            </span>
          </div>
        </Link>

        <div className="h-6 w-px bg-[var(--cw-border)] mx-1 hidden sm:block" />

        {/* Journey Chip */}
        <div
          data-testid="journey-chip"
          className="flex flex-col justify-center px-3 py-1 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-background)] min-w-0 max-w-[200px] lg:max-w-[240px]"
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-xs font-semibold text-[var(--cw-text)] truncate"
              title={template.title}
            >
              {template.title}
            </span>
            <Link
              href="/"
              data-testid="journey-edit-pencil"
              className="text-[var(--cw-text-muted)] hover:text-[var(--cw-brand)] transition-colors shrink-0"
              aria-label="Edit journey or return to home"
              title="Return to journeys list"
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </Link>
          </div>
          {/* 3px Progress Bar under journey chip */}
          <div
            data-testid="journey-progress-bar"
            className="h-[3px] w-full bg-[var(--cw-border)]/60 rounded-full overflow-hidden mt-1"
            title={`${done} of ${total} steps done (${progressPercent}%)`}
          >
            <div
              className="h-full bg-[var(--cw-brand)] transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Location Chip */}
        <div
          data-testid="location-chip"
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--cw-border)] bg-[var(--cw-background)] text-[11px] font-medium text-[var(--cw-text-muted)] shrink-0"
        >
          <svg
            className="w-3 h-3 text-[var(--cw-text-muted)] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span className="truncate max-w-[140px]">{locationText}</span>
        </div>
      </div>

      {/* 4 Summary Tiles */}
      <div
        data-testid="top-bar-summary-tiles"
        className="hidden lg:grid grid-cols-4 gap-2 flex-1 max-w-[560px] xl:max-w-[640px]"
      >
        <SummaryTile
          testId="topbar-tile-next-up"
          label="Next up"
          value={summary.nextUpText}
        />
        <SummaryTile
          testId="topbar-tile-fees"
          label="Estimated fee"
          value={summary.feesText}
        />
        <SummaryTile
          testId="topbar-tile-time"
          label="Total time"
          value={summary.timeText}
        />
        <SummaryTile
          testId="topbar-tile-visits"
          label="Office visits"
          value={summary.officeVisitsText}
        />
      </div>

      {/* Share Journey button */}
      <div className="shrink-0 flex items-center">
        <button
          type="button"
          data-testid="share-journey-button"
          onClick={onShare}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-xs ${
            copied
              ? "bg-[var(--cw-done)] text-white"
              : "border border-[var(--cw-border)] bg-[var(--cw-background)] text-[var(--cw-text)] hover:border-[var(--cw-brand)] hover:text-[var(--cw-brand)]"
          }`}
          aria-label={copied ? "Share link copied" : "Share Journey"}
        >
          {copied ? (
            <>
              <svg
                className="w-3.5 h-3.5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span>Link copied</span>
            </>
          ) : (
            <>
              <svg
                className="w-3.5 h-3.5 text-current"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              <span>Share Journey</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
