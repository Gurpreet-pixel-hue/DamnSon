"use client";

import React, { useState } from "react";

export function KeysHintModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-testid="footer-keys-hint-button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-background)] text-xs text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] hover:bg-[var(--cw-border)]/20 transition-colors cursor-pointer select-none"
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
      >
        <span className="font-mono text-[11px] font-semibold">?</span>
        <span>Keys</span>
      </button>

      {open && (
        <div
          data-testid="keys-hint-popover"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-4 shadow-xl text-xs text-[var(--cw-text)] flex flex-col gap-3 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--cw-border)] pb-2">
              <span className="font-semibold text-sm">Keyboard Shortcuts</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] p-1 rounded hover:bg-black/5 cursor-pointer leading-none text-base"
                aria-label="Close shortcuts"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-1.5 divide-y divide-[var(--cw-border)]/50">
              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--cw-text-muted)]">Previous / next stage</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--cw-surface-muted)] border border-[var(--cw-border)] font-mono text-[11px]">
                  ← / → <span className="opacity-60">(or [ / ])</span>
                </kbd>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--cw-text-muted)]">Previous / next station</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--cw-surface-muted)] border border-[var(--cw-border)] font-mono text-[11px]">
                  ↑ / ↓
                </kbd>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--cw-text-muted)]">Open drawer</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--cw-surface-muted)] border border-[var(--cw-border)] font-mono text-[11px]">
                  Enter
                </kbd>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--cw-text-muted)]">Toggle done</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--cw-surface-muted)] border border-[var(--cw-border)] font-mono text-[11px]">
                  Space
                </kbd>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--cw-text-muted)]">Close drawer / Overview</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--cw-surface-muted)] border border-[var(--cw-border)] font-mono text-[11px]">
                  Esc
                </kbd>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--cw-text-muted)]">First / last stage</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--cw-surface-muted)] border border-[var(--cw-border)] font-mono text-[11px]">
                  Home / End
                </kbd>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--cw-text-muted)]">Back to current stage</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--cw-surface-muted)] border border-[var(--cw-border)] font-mono text-[11px]">
                  C
                </kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
