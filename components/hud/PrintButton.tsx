"use client";

import React from "react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      data-testid="print-page-btn"
      className="print:hidden inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--cw-brand)] text-white text-xs font-semibold hover:opacity-95 transition-opacity shadow-xs cursor-pointer"
    >
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      <span>Print Checklist</span>
    </button>
  );
}
