"use client";

import React, { useState, useRef, useEffect } from "react";

export function KeysHintModal() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Focus into dialog on open (A3)
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable && focusable.length > 0) {
      focusable[0]?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (e.key === "Tab") {
        if (!dialogRef.current || !focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
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
          onClick={handleClose}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="keys-hint-title"
            tabIndex={-1}
            className="w-full max-w-sm rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-4 shadow-xl text-xs text-[var(--cw-text)] flex flex-col gap-3 select-none outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--cw-border)] pb-2">
              <span id="keys-hint-title" className="font-semibold text-sm">
                Keyboard Shortcuts
              </span>
              <button
                type="button"
                onClick={handleClose}
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
