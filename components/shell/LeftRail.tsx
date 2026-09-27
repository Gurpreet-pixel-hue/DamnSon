"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useViewStore, type JourneyPanel } from "@/lib/store/useViewStore";

export interface LeftRailProps {
  className?: string;
  /** Unanswered questions that still change the map (shows a badge on "Questions"). */
  questionCount?: number;
  /** False when the journey's template asks no questions (e.g. the same procedure for everyone). */
  hasQuestions?: boolean;
}

const PANELS: { id: JourneyPanel; label: string; icon: React.ReactNode }[] = [
  { id: "questions", label: "Questions", icon: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></> },
  { id: "summary", label: "Summary", icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h10M7 17h6" /></> },
  { id: "whatif", label: "What if", icon: <><path d="M4 6h10M4 12h16M4 18h7" /><circle cx="17" cy="6" r="2" /><circle cx="14" cy="18" r="2" /></> },
  { id: "visits", label: "Office visits", icon: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></> },
  { id: "documents", label: "Documents", icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 15l2 2 4-4" /></> },
];

export function LeftRail({ className = "", questionCount = 0, hasQuestions = true }: LeftRailProps) {
  const pathname = usePathname();
  const isJourney = pathname?.startsWith("/journey");
  const activePanel = useViewStore((s) => s.activePanel);
  const togglePanel = useViewStore((s) => s.togglePanel);

  return (
    <nav
      data-testid="left-rail"
      aria-label="App navigation"
      className={`w-16 xl:w-[200px] shrink-0 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-2.5 flex flex-col gap-1.5 shadow-xs transition-all duration-200 select-none ${className}`}
    >
      <Link
        href="/"
        data-testid="rail-link-home"
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
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
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
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

      {isJourney && (
        <div className="mt-2 pt-2 border-t border-[var(--cw-border)] flex flex-col gap-1.5" aria-label="Journey panels">
          {PANELS.filter((panel) => hasQuestions || (panel.id !== "questions" && panel.id !== "whatif")).map((panel) => {
            const on = activePanel === panel.id;
            const badge = panel.id === "questions" && questionCount > 0 ? questionCount : null;
            return (
              <button
                key={panel.id}
                type="button"
                data-testid={`rail-panel-${panel.id}`}
                aria-pressed={on}
                title={panel.label}
                onClick={() => togglePanel(panel.id)}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cw-available)] ${
                  on
                    ? "bg-[var(--cw-brand)]/10 text-[var(--cw-brand)]"
                    : "text-[var(--cw-text-muted)] hover:bg-[var(--cw-border)]/20 hover:text-[var(--cw-text)]"
                }`}
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {panel.icon}
                </svg>
                <span className="hidden xl:inline truncate">{panel.label}</span>
                {badge !== null && (
                  <span
                    aria-label={`${badge} unanswered`}
                    className="absolute top-1 right-1 xl:static xl:ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--cw-undecided)] text-white text-[10px] leading-[18px] text-center"
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
