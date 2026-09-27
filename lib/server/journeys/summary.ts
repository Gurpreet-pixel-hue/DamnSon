import "server-only";
import type { TemplateSummary } from "@/lib/contract/api";
import { composeJourney, type ComposedActionStep, type ComposedStep } from "@/lib/contract/compose";
import type { ApprovalModule, JourneyTemplate } from "@/lib/contract/schema";
import { searchTemplates } from "./search";

const isActionStep = (step: ComposedStep): step is ComposedActionStep => step.kind !== "milestone";

/**
 * Counts come from the maximal composition, so a summary describes the whole procedure rather than one
 * citizen's path. Milestones are excluded from both counts: they are outcomes, not things to do.
 * Shared by the file and database repositories so a listing never depends on where it was read from.
 */
export function toSummary(template: JourneyTemplate, modules: readonly ApprovalModule[]): TemplateSummary {
  const actionSteps = composeJourney(template, modules, {}, { maximal: true }).steps.filter(isActionStep);
  const { state, city } = template.jurisdiction;
  return {
    taskId: template.taskId,
    revision: template.revision,
    title: template.title,
    summary: template.summary,
    category: template.category,
    jurisdiction: city === undefined ? { state } : { state, city },
    keywords: [...template.keywords],
    questionFacts: template.questions.map((question) => question.fact),
    stepCount: actionSteps.length,
    verifiedStepCount: actionSteps.filter((step) => step.review.status === "verified").length,
  };
}

/** City filter, then query ranking; without a query, a stable title order. */
export function applyListFilters(
  summaries: readonly TemplateSummary[],
  opts?: { q?: string | undefined; city?: string | undefined },
): TemplateSummary[] {
  let result = [...summaries];

  const city = opts?.city?.trim().toLowerCase();
  if (city !== undefined && city.length > 0) {
    result = result.filter((summary) => summary.jurisdiction.city?.toLowerCase() === city);
  }

  const q = opts?.q?.trim();
  if (q !== undefined && q.length > 0) return searchTemplates(result, q);

  return result.sort((a, b) => a.title.localeCompare(b.title) || a.taskId.localeCompare(b.taskId));
}
