"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JourneyTemplate, ApprovalModule } from "@/lib/contract/schema";
import type { ComposedJourney } from "@/lib/contract/compose";
import { YourSituationPanel } from "@/components/hud/YourSituationPanel";

export interface LeftRailProps {
  template?: JourneyTemplate;
  modules?: ApprovalModule[];
  journey?: ComposedJourney;
  className?: string;
}

export function LeftRail({
  template,
  modules,
  journey,
  className = "",
}: LeftRailProps) {
  const pathname = usePathname();
  const isJourney = pathname?.startsWith("/journey");
  const [sheetOpen, setSheetOpen] = useState(false);

  const hasSituation = Boolean(template && modules && journey);

  return (
    <>
      <nav
        data-testid="left-rail"
        aria-label="App navigation and situation"
        className={`w-16 xl:w-[248px] min-[1440px]:w-[280px] shrink-0 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-2.5 flex flex-col gap-3 shadow-xs transition-all duration-200 select-none overflow-hidden ${className}`}
      >
        {/* Navigation links */}
        <div className="flex flex-col gap-1 shrink-0">
          <Link
            href="/"
            data-testid="rail-link-home"
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              pathname === "/"
                ? "bg-[var(--cw-border)]/40 text-[var(--cw-text)]"
                : "text-[var(--cw-text-muted)] hover:bg-[var(--cw-border)]/20 hover:text-[var(--cw-text)]"
            }`}
            title="Home"
          >
            <svg
              className="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span className="hidden xl:inline truncate">Home</span>
          </Link>

          <Link
            href="#"
            data-testid="rail-link-my-journey"
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              isJourney
                ? "bg-[var(--cw-brand)]/10 text-[var(--cw-brand)]"
                : "text-[var(--cw-text-muted)] hover:bg-[var(--cw-border)]/20 hover:text-[var(--cw-text)]"
            }`}
            title="My Journey"
          >
            <svg
              className="w-4 h-4 shrink-0 text-current"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            <span className="hidden xl:inline truncate">My Journey</span>
          </Link>

          {/* Compact Situation trigger for 1024-1279px */}
          {hasSituation && (
            <button
              type="button"
              data-testid="rail-btn-situation-sheet"
              onClick={() => setSheetOpen(true)}
              className="xl:hidden flex items-center justify-center p-2 rounded-xl text-xs font-semibold text-[var(--cw-text-muted)] hover:bg-[var(--cw-border)]/20 hover:text-[var(--cw-text)] transition-colors relative"
              title="Your situation (Facts & Questions)"
              aria-label="Open your situation panel"
            >
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              {journey && journey.questions.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-[var(--cw-surface)]" />
              )}
            </button>
          )}
        </div>

        {/* Situation Panel body (visible at xl: / ≥1280px) with internal scroll */}
        {hasSituation && (
          <div className="hidden xl:flex flex-col min-h-0 flex-1 border-t border-[var(--cw-border)]/50 pt-3">
            <YourSituationPanel
              template={template!}
              modules={modules!}
              journey={journey}
              className="min-h-0 flex-1 pr-0.5"
            />
          </div>
        )}
      </nav>

      {/* Floating Sheet for Your Situation at 1024-1279px (Amendment 6) */}
      {hasSituation && sheetOpen && (
        <div
          data-testid="situation-sheet-overlay"
          className="xl:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-start p-4"
          onClick={() => setSheetOpen(false)}
        >
          <div
            data-testid="situation-sheet-content"
            className="w-[340px] h-full rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-4 flex flex-col gap-3 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--cw-border)]/60 pb-2 shrink-0">
              <span className="text-sm font-bold text-[var(--cw-text)]">
                Your Situation
              </span>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="p-1 rounded-lg text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] hover:bg-[var(--cw-border)]/20"
                aria-label="Close sheet"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <YourSituationPanel
              template={template!}
              modules={modules!}
              journey={journey}
              className="min-h-0 flex-1"
            />
          </div>
        </div>
      )}
    </>
  );
}
