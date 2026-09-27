"use client";

import React, { useState } from "react";
import {
  FACTS,
  isValidFactValue,
  type FactKey,
  type FactValue,
} from "@/lib/contract/facts";
import type { Question } from "@/lib/contract/schema";

export interface FactInputProps {
  fact: FactKey;
  value: FactValue | undefined;
  /** Options from the template question; falls back to the registry's enum values. */
  options?: Question["options"];
  onChange: (value: FactValue) => void;
  /** Accessible name for the control group (usually the question text). */
  label: string;
}

const chip =
  "px-3 py-2 rounded-xl text-xs font-semibold border transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cw-available)] cursor-pointer";
const chipOn = "bg-[var(--cw-brand)] text-white border-[var(--cw-brand)]";
const chipOff =
  "bg-[var(--cw-surface)] text-[var(--cw-text)] border-[var(--cw-border)] hover:bg-[var(--cw-surface-muted)]";

/** One answer control per fact type (PRD §8.3 registry): yes/no, options, or a bounded number. */
export function FactInput({
  fact,
  value,
  options,
  onChange,
  label,
}: FactInputProps) {
  const def = FACTS[fact];
  if (!def) return null;

  if (def.type === "boolean") {
    return (
      <div role="radiogroup" aria-label={label} className="flex gap-2">
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            className={`${chip} ${value === v ? chipOn : chipOff}`}
            onClick={() => onChange(v)}
          >
            {v ? "Yes" : "No"}
          </button>
        ))}
      </div>
    );
  }

  if (def.type === "enum") {
    const choices = options?.length
      ? options.filter((o) => isValidFactValue(fact, o.value))
      : def.values.map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
    return (
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-2"
      >
        {choices.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`${chip} ${value === o.value ? chipOn : chipOff}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  if (def.type === "integer" || def.type === "number") {
    return (
      <NumberInput
        key={String(value)}
        fact={fact}
        min={def.min}
        max={def.max}
        value={value}
        onChange={onChange}
        label={label}
      />
    );
  }

  return null;
}

function NumberInput({
  fact,
  min,
  max,
  value,
  onChange,
  label,
}: {
  fact: FactKey;
  min: number;
  max: number;
  value: FactValue | undefined;
  onChange: (value: FactValue) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(
    typeof value === "number" ? String(value) : ""
  );

  const commit = (n: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(n)));
    if (isValidFactValue(fact, clamped)) onChange(clamped);
  };
  const current = typeof value === "number" ? value : min;

  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        className={`${chip} ${chipOff} w-9 h-9 flex items-center justify-center p-0`}
        aria-label="Decrease"
        onClick={() => commit(current - 1)}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        aria-label={label}
        className="w-24 px-3 py-2 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] text-sm text-[var(--cw-text)] tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cw-available)]"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() !== "" && commit(Number(draft))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim() !== "") commit(Number(draft));
        }}
      />
      <button
        type="button"
        className={`${chip} ${chipOff} w-9 h-9 flex items-center justify-center p-0`}
        aria-label="Increase"
        onClick={() => commit(current + 1)}
      >
        +
      </button>
    </div>
  );
}
