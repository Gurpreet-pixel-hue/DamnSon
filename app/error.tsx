"use client";

import React, { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global app error caught:", error);
  }, [error]);

  return (
    <main
      data-testid="app-error"
      className="min-h-screen bg-[var(--cw-background)] text-[var(--cw-text)] flex flex-col items-center justify-center p-6 md:p-12"
    >
      <div className="w-full max-w-md p-8 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] shadow-sm text-center flex flex-col items-center gap-5">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none" aria-label="CivicWeave Mark">
            <path d="M4 8h24M8 16h20M4 24h24" stroke="var(--cw-brand)" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M12 4v24M20 4v24" stroke="var(--cw-available)" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
          <span className="text-lg font-bold tracking-tight text-[var(--cw-text)]">
            CivicWeave
          </span>
        </Link>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-widest text-rose-600">
            System Notice
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--cw-text)]">
            Something unexpected occurred
          </h1>
          <p className="text-xs text-[var(--cw-text-muted)] leading-relaxed mt-1">
            {error.message || "An unexpected error occurred while rendering the page."}
          </p>
        </div>

        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="px-5 py-2.5 rounded-xl bg-[var(--cw-brand)] text-white text-xs font-semibold hover:opacity-95 transition-opacity shadow-xs"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2.5 rounded-xl border border-[var(--cw-border)] text-[var(--cw-text)] text-xs font-semibold hover:bg-[var(--cw-border)]/20 transition-colors"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
