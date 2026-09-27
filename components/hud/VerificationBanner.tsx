import React from "react";
import type { ComposedJourney } from "@/lib/contract/compose";

export interface VerificationSummary {
  unverifiedCount: number;
  flaggedCount: number;
  isPartiallyVerified: boolean;
}

/**
 * Summarizes the review status of action steps in a composed journey (P2 & §8.8).
 * Milestones are excluded as they do not have review status.
 */
export function summarizeVerification(journey: ComposedJourney): VerificationSummary {
  let unverifiedCount = 0;
  let flaggedCount = 0;

  for (const step of journey.steps) {
    if (step.kind === "milestone") continue;
    const status = step.review?.status;
    if (status === "unverified") {
      unverifiedCount++;
    } else if (status === "flagged") {
      flaggedCount++;
    }
  }

  return {
    unverifiedCount,
    flaggedCount,
    isPartiallyVerified: unverifiedCount > 0 || flaggedCount > 0,
  };
}

export interface VerificationBannerProps {
  journey: ComposedJourney;
  className?: string;
}

export function VerificationBanner({ journey, className = "" }: VerificationBannerProps) {
  const summary = summarizeVerification(journey);

  if (!summary.isPartiallyVerified) {
    return null;
  }

  const unverifiedMessage =
    summary.unverifiedCount > 0
      ? summary.unverifiedCount === 1
        ? "1 step isn't verified yet — check the official source before acting"
        : `${summary.unverifiedCount} steps aren't verified yet — check the official source before acting`
      : null;

  const flaggedMessage =
    summary.flaggedCount > 0
      ? summary.flaggedCount === 1
        ? "1 step is flagged as possibly out of date — check the official source before acting"
        : `${summary.flaggedCount} steps are flagged as possibly out of date — check the official source before acting`
      : null;

  return (
    <div
      role="status"
      data-testid="verification-banner"
      className={`flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs ${className}`}
    >
      <div className="flex items-center gap-2 font-medium shrink-0">
        <svg
          className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="font-semibold uppercase tracking-wider text-[10px] text-amber-700 dark:text-amber-300">
          Verification Notice
        </span>
      </div>

      <div className="flex flex-col gap-0.5 min-w-0">
        {unverifiedMessage && (
          <span data-testid="unverified-notice" className="leading-tight">
            {unverifiedMessage}
          </span>
        )}
        {flaggedMessage && (
          <span data-testid="flagged-notice" className="leading-tight">
            {flaggedMessage}
          </span>
        )}
      </div>
    </div>
  );
}
