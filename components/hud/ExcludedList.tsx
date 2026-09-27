"use client";

import React, { useState } from "react";
import type { ExcludedItem } from "@/lib/contract/compose";
import type { FactKey } from "@/lib/contract/facts";

export interface ExcludedListProps {
  excluded: ExcludedItem[];
  className?: string;
  onFocusFact?: (key: FactKey) => void;
}

export function ExcludedList({
  excluded,
  className = "",
  onFocusFact,
}: ExcludedListProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (excluded.length === 0) return null;

  const handleFocusFact = (factKey: FactKey) => {
    if (onFocusFact) {
      onFocusFact(factKey);
      return;
    }
    const elId = `fact-editor-${factKey.replace(/\./g, "-")}`;
    const el = document.getElementById(elId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-[var(--cw-brand)]");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-[var(--cw-brand)]");
      }, 2000);
      const editBtn = el.querySelector<HTMLButtonElement>(
        `[data-testid="fact-toggle-edit-${factKey}"]`
      );
      if (editBtn) editBtn.click();
    }
  };

  return (
    <div
      data-testid="excluded-list-card"
      className={`rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-3.5 flex flex-col gap-2 shadow-2xs ${className}`}
    >
      <button
        type="button"
        data-testid="toggle-excluded-list"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex flex-col">
          <span className="text-xs font-bold text-[var(--cw-text)] tracking-tight">
            Not Needed For You
          </span>
          <span className="text-[10px] text-[var(--cw-text-muted)]">
            Steps skipped based on your answers
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--cw-border)]/40 text-[var(--cw-text-muted)]">
            {excluded.length} skipped
          </span>
          <svg
            className={`w-3.5 h-3.5 text-[var(--cw-text-muted)] transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--cw-border)]/50 mt-1">
          {excluded.map((item, idx) => (
            <div
              key={idx}
              data-testid={`excluded-item-${idx}`}
              className="p-2.5 rounded-lg border border-[var(--cw-border)]/50 bg-[var(--cw-background)] flex flex-col gap-1.5 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-xs text-[var(--cw-text)]">
                  {item.title}
                </span>
                <span className="text-[9px] font-medium uppercase px-1.5 py-0.5 rounded bg-[var(--cw-border)]/30 text-[var(--cw-text-muted)] shrink-0">
                  {item.kind === "module" ? "Module" : "Step"}
                </span>
              </div>

              <p className="text-[11px] text-[var(--cw-text-muted)] leading-snug">
                {item.reason}
              </p>

              {item.facts.length > 0 && (
                <div className="flex items-center justify-between pt-1 border-t border-[var(--cw-border)]/40 gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {item.facts.map((f) => (
                      <span
                        key={f}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--cw-border)]/30 text-[var(--cw-text-muted)]"
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  {item.facts[0] && (
                    <button
                      type="button"
                      data-testid={`change-answer-${item.facts[0]}`}
                      onClick={() => handleFocusFact(item.facts[0]!)}
                      className="text-[10px] font-semibold text-[var(--cw-brand)] hover:underline shrink-0"
                    >
                      Change answer
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
