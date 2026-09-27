"use client";

import React, { useEffect } from "react";
import Link from "next/link";

export default function JourneyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log client error trace for diagnostic observability
    console.error("JourneyError caught:", error);
  }, [error]);

  return (
    <div
      data-testid="journey-error"
      className="min-h-screen bg-[var(--cw-background)] text-[var(--cw-text)] flex flex-col items-center justify-center p-6"
    >
      <div className="w-full max-w-md p-8 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] shadow-sm text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-600 dark:text-red-400 font-mono font-bold text-lg">
          !
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-bold tracking-tight text-[var(--cw-text)]">
            Could not load this journey
          </h1>
          <p className="text-sm text-[var(--cw-text-muted)] leading-relaxed">
            {error.message || "An unexpected error occurred while loading or parsing the journey data."}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 rounded-lg bg-[var(--cw-brand)] text-white text-xs font-semibold tracking-wide hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
          <Link
            href="/"
            className="px-4 py-2.5 rounded-lg border border-[var(--cw-border)] text-[var(--cw-text)] text-xs font-semibold hover:bg-[var(--cw-border)]/20 transition-colors"
          >
            Back to journeys
          </Link>
        </div>
      </div>
    </div>
  );
}
