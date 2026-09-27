"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface LeftRailProps {
  className?: string;
}

export function LeftRail({ className = "" }: LeftRailProps) {
  const pathname = usePathname();
  const isJourney = pathname?.startsWith("/journey");

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
    </nav>
  );
}
