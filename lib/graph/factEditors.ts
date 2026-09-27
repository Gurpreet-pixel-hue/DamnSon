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
