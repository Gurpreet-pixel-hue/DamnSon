"use client";

import React, { useMemo, useState } from "react";
import type { ApprovalModule, JourneyTemplate } from "@/lib/contract/schema";
import type { FactKey, FactValue } from "@/lib/contract/facts";
import { getUsedFacts, getFactEditorModel } from "@/lib/graph/factEditors";
import { useTaskStore } from "@/lib/store/useTaskStore";

export interface FactCardProps {
  template: JourneyTemplate;
  modules: ApprovalModule[];
  className?: string;
  onFocusFact?: (key: FactKey) => void;
}

export function FactCard({
  template,
  modules,
  className = "",
}: FactCardProps) {
  const storeActiveTaskId = useTaskStore((s) => s.activeTaskId);
  const targetTaskId = storeActiveTaskId ?? template.taskId;
  const factsByTask = useTaskStore((s) => s.factsByTask);
  const setFact = useTaskStore((s) => s.setFact);
  const clearFact = useTaskStore((s) => s.clearFact);

  const [expandedKey, setExpandedKey] = useState<FactKey | null>(null);

  const currentFacts = useMemo(
    () => (targetTaskId ? factsByTask[targetTaskId] ?? {} : {}),
    [targetTaskId, factsByTask]
  );

  // Scope: only facts used by template & modules (Amendment 4)
  const usedFactKeys = useMemo(
    () => getUsedFacts(template, modules),
    [template, modules]
  );

  const editorModels = useMemo(
    () => usedFactKeys.map((k) => getFactEditorModel(k, currentFacts)),
    [usedFactKeys, currentFacts]
  );

  const handleValueChange = (key: FactKey, value: FactValue) => {
    if (!targetTaskId) return;
    setFact(targetTaskId, key, value);
  };

  const handleClear = (key: FactKey) => {
    if (!targetTaskId) return;
    clearFact(targetTaskId, key);
  };

  return (
    <div
      data-testid="fact-card"
      className={`rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-3.5 flex flex-col gap-3 shadow-2xs ${className}`}
    >
      <div className="flex items-center justify-between border-b border-[var(--cw-border)]/50 pb-2">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-[var(--cw-text)] tracking-tight">
            Your Profile & Facts
          </span>
          <span className="text-[10px] text-[var(--cw-text-muted)]">
            Customises the procedural steps
          </span>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--cw-border)]/30 text-[var(--cw-text-muted)]">
          {editorModels.filter((m) => m.isSet).length}/{editorModels.length} set
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {editorModels.map((item) => {
          const isExpanded = expandedKey === item.key;
          const factId = `fact-editor-${item.key.replace(/\./g, "-")}`;

          return (
            <div
              key={item.key}
              id={factId}
              data-testid={`fact-item-${item.key}`}
              className={`p-2.5 rounded-lg border transition-colors flex flex-col gap-2 ${
                item.isSet
                  ? "border-[var(--cw-brand)]/20 bg-[var(--cw-brand)]/5"
                  : "border-[var(--cw-border)]/60 bg-[var(--cw-background)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-semibold text-[var(--cw-text)] truncate">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-[var(--cw-text-muted)] truncate">
                    {item.isSet ? String(item.value) : "Not specified"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {item.isSet && (
                    <button
                      type="button"
                      data-testid={`fact-clear-${item.key}`}
                      onClick={() => handleClear(item.key)}
                      className="text-[10px] font-medium text-[var(--cw-text-muted)] hover:text-[var(--cw-brand)] px-1.5 py-0.5 rounded transition-colors"
                      title="Clear fact (set to unknown)"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid={`fact-toggle-edit-${item.key}`}
                    onClick={() => setExpandedKey(isExpanded ? null : item.key)}
                    className="text-[10px] font-semibold text-[var(--cw-brand)] hover:underline px-1 py-0.5"
                  >
                    {isExpanded ? "Done" : item.isSet ? "Edit" : "Set"}
                  </button>
                </div>
              </div>

              {/* Inline Editor */}
              {isExpanded && (
                <div
                  data-testid={`fact-editor-controls-${item.key}`}
                  className="pt-2 border-t border-[var(--cw-border)]/40 flex flex-col gap-2"
                >
                  {/* Boolean Editor */}
                  {item.type === "boolean" && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        data-testid={`fact-bool-yes-${item.key}`}
                        onClick={() => handleValueChange(item.key, true)}
                        className={`py-1 rounded text-xs font-semibold transition-colors ${
                          item.value === true
                            ? "bg-[var(--cw-brand)] text-white"
                            : "border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] hover:bg-[var(--cw-border)]/20"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        data-testid={`fact-bool-no-${item.key}`}
                        onClick={() => handleValueChange(item.key, false)}
                        className={`py-1 rounded text-xs font-semibold transition-colors ${
                          item.value === false
                            ? "bg-[var(--cw-brand)] text-white"
                            : "border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] hover:bg-[var(--cw-border)]/20"
                        }`}
                      >
                        No
                      </button>
                    </div>
                  )}

                  {/* Enum Editor */}
                  {item.type === "enum" && "values" in item.def && (
                    <select
                      data-testid={`fact-enum-select-${item.key}`}
                      value={item.value !== undefined ? String(item.value) : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) handleValueChange(item.key, val);
                        else handleClear(item.key);
                      }}
                      className="w-full text-xs p-1.5 rounded border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] focus:ring-[var(--cw-brand)] focus:border-[var(--cw-brand)]"
                    >
                      <option value="">Select option...</option>
                      {item.def.values.map((v) => (
                        <option key={v} value={v}>
                          {v.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Integer / Number Editor */}
                  {(item.type === "integer" || item.type === "number") && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        data-testid={`fact-number-input-${item.key}`}
                        min={"min" in item.def ? item.def.min : 0}
                        max={"max" in item.def ? item.def.max : 1000000}
                        value={item.value !== undefined ? Number(item.value) : ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            handleClear(item.key);
                          } else {
                            const num =
                              item.type === "integer"
                                ? parseInt(raw, 10)
                                : parseFloat(raw);
                            if (!Number.isNaN(num)) {
                              handleValueChange(item.key, num);
                            }
                          }
                        }}
                        className="w-full text-xs p-1.5 rounded border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] focus:ring-[var(--cw-brand)] focus:border-[var(--cw-brand)]"
                      />
                    </div>
                  )}

                  {/* String Editor */}
                  {item.type === "string" && (
                    <input
                      type="text"
                      data-testid={`fact-string-input-${item.key}`}
                      maxLength={"maxLength" in item.def ? item.def.maxLength : 60}
                      value={item.value !== undefined ? String(item.value) : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.trim() === "") handleClear(item.key);
                        else handleValueChange(item.key, val);
                      }}
                      className="w-full text-xs p-1.5 rounded border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] focus:ring-[var(--cw-brand)] focus:border-[var(--cw-brand)]"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
