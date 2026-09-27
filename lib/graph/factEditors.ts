import { FACTS, type FactDef, type FactKey, type Facts, type FactValue } from "@/lib/contract/facts";
import { ruleFacts } from "@/lib/contract/rules";
import type { ApprovalModule, JourneyTemplate } from "@/lib/contract/schema";

export interface FactEditorItem {
  key: FactKey;
  label: string;
  type: FactDef["type"];
  value: FactValue | undefined;
  isSet: boolean;
  def: FactDef;
}

/**
 * Collects all facts used by the template, its questions, module activations,
 * step conditional rules, step repeats, and per-person document copies (PRD §8.6 & Amendment 4).
 * The Fact Card displays ONLY these facts — never an 'Add fact from FACT_KEYS' selector.
 */
export function getUsedFacts(
  template: JourneyTemplate,
  modules: readonly ApprovalModule[]
): FactKey[] {
  const seen = new Set<FactKey>();
  const list: FactKey[] = [];

  const add = (k: FactKey | undefined) => {
    if (k && !seen.has(k) && FACTS[k]) {
      seen.add(k);
      list.push(k);
    }
  };

  // 1. Template questions
  for (const q of template.questions) {
    add(q.fact);
  }

  // 2. Module activations in template
  for (const m of template.modules) {
    if (m.activation) {
      for (const f of ruleFacts(m.activation)) {
        add(f);
      }
    }
  }

  // 3. Module internal step rules, repeats, and doc perPerson facts
  for (const mod of modules) {
    for (const step of mod.steps) {
      if (step.kind !== "milestone") {
        if (step.repeat) add(step.repeat.fact);
        if (step.requirement.kind === "conditional" && step.requirement.rule) {
          for (const f of ruleFacts(step.requirement.rule)) {
            add(f);
          }
        }
        for (const doc of step.documents) {
          if (doc.perPerson) add(doc.perPerson.fact);
        }
      }
    }
  }

  return list;
}

/**
 * Builds the editor view model for a single fact key.
 */
export function getFactEditorModel(key: FactKey, currentFacts: Facts): FactEditorItem {
  const def = FACTS[key];
  const value = currentFacts[key];
  const isSet = value !== undefined;

  return {
    key,
    label: def ? def.label : key,
    type: def ? def.type : "string",
    value,
    isSet,
    def,
  };
}

/**
 * Formats a fact value for human-readable display in the situation rail (§8.6 & FE-4 Fixes):
 * - Booleans show Yes/No
 * - Numbers show as digits (e.g. "2")
 * - Enums replace underscores with spaces and capitalize the first letter (e.g. "it_saas" -> "It saas")
 */
export function formatFactDisplayValue(value: FactValue | undefined): string {
  if (value === undefined || value === null) return "Not specified";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const withSpaces = value.replace(/_/g, " ");
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
  }
  return String(value);
}
