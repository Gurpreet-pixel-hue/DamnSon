import type { ComposedJourney } from "@/lib/contract/compose";

export interface LinkedStep {
  id: string;
  title: string;
  /** "requires" locks the step until the other is done; "recommended_after" is only a suggested order. */
  kind: "requires" | "recommended_after";
  note?: string;
}

export interface StepExplanation {
  /** Why the step is on this citizen's map (conditions and module reasons from the template). */
  appliesBecause: string[];
  /** Plain status of the step's applicability. */
  applicability: "applies" | "may_apply" | "optional";
  dependsOn: LinkedStep[];
  unlocks: LinkedStep[];
}

/**
 * Deterministic "why is this here / what does it depend on / what does it unlock" for one step,
 * read straight from the composed journey (reasons and edges). Pure; derived, never stored (PRD P3).
 */
export function explainStep(journey: ComposedJourney, stepId: string): StepExplanation | null {
  const step = journey.steps.find((s) => s.id === stepId);
  if (!step) return null;
  const titles = new Map(journey.steps.map((s) => [s.id, s.title]));
  const link = (id: string, kind: LinkedStep["kind"], note?: string): LinkedStep => ({
    id,
    title: titles.get(id) ?? id,
    kind,
    ...(note ? { note } : {}),
  });

  const dependsOn = journey.edges.filter((e) => e.to === stepId).map((e) => link(e.from, e.kind, e.note));
  const unlocks = journey.edges.filter((e) => e.from === stepId).map((e) => link(e.to, e.kind, e.note));
  const byKind = (a: LinkedStep, b: LinkedStep) => (a.kind === b.kind ? 0 : a.kind === "requires" ? -1 : 1);

  return {
    appliesBecause: [...new Set(step.reasons)],
    applicability: step.applicability,
    dependsOn: dependsOn.sort(byKind),
    unlocks: unlocks.sort(byKind),
  };
}
