import React from "react";
import type { ComposedJourney, ComposedActionStep } from "@/lib/contract/compose";

export interface VerificationSummary {
  unverifiedCount: number;
  flaggedCount: number;
  isPartiallyVerified: boolean;
  unverifiedSteps: ComposedActionStep[];
  flaggedSteps: ComposedActionStep[];
}

/**
 * Summarizes the review status of action steps in a composed journey (P2 & §8.8).
 * Milestones are excluded as they do not have review status.
 */
export function summarizeVerification(journey: ComposedJourney): VerificationSummary {
  let unverifiedCount = 0;
  let flaggedCount = 0;
  const unverifiedSteps: ComposedActionStep[] = [];
  const flaggedSteps: ComposedActionStep[] = [];

  for (const step of journey.steps) {
    if (step.kind === "milestone") continue;
    const status = step.review?.status;
    if (status === "unverified") {
      unverifiedCount++;
      unverifiedSteps.push(step);
    } else if (status === "flagged") {
      flaggedCount++;
      flaggedSteps.push(step);
    }
  }

  return {
    unverifiedCount,
    flaggedCount,
    isPartiallyVerified: unverifiedCount > 0 || flaggedCount > 0,
    unverifiedSteps,
    flaggedSteps,
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

  const parts: string[] = [];
  if (summary.unverifiedCount > 0) {
    parts.push(
      summary.unverifiedCount === 1
        ? "1 step isn't verified yet"
        : `${summary.unverifiedCount} steps aren't verified yet`
    );
  }
  if (summary.flaggedCount > 0) {
    parts.push(
      summary.flaggedCount === 1
        ? "1 flagged as possibly out of date"
        : `${summary.flaggedCount} flagged as possibly out of date`
    );
  }

  const headline = `${parts.join(" · ")} — check the official source before acting`;
  const allAffectedSteps = [...summary.flaggedSteps, ...summary.unverifiedSteps];

  return (
    <div
      role="status"
      data-testid="verification-banner"
      className={`rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs ${className}`}
    >
      <details className="group">
        <summary className="min-h-[40px] px-3.5 py-2 flex items-center justify-between gap-3 cursor-pointer list-none select-none">
          <div className="flex items-center gap-2.5 min-w-0">
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
            <span data-testid="verification-message" className="truncate font-medium">
              {headline}
            </span>
          </div>
          <span className="text-[11px] underline font-medium text-amber-800 dark:text-amber-300 ml-2 shrink-0 group-open:no-underline">
            Details
          </span>
        </summary>

        <div
          data-testid="verification-details"
          className="px-3.5 pb-2.5 pt-1 border-t border-amber-500/20 flex flex-col gap-1.5 max-h-36 overflow-y-auto"
        >
          {allAffectedSteps.map((step) => (
            <div key={step.id} className="flex items-center justify-between text-[11px] gap-2">
              <span className="font-medium text-[var(--cw-text)] truncate">{step.title}</span>
              <span className="text-amber-800 dark:text-amber-300 shrink-0">
                {step.review.status === "flagged"
                  ? step.review.note || "Flagged"
                  : "Unverified"}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
