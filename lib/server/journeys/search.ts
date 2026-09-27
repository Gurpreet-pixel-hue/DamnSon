import "server-only";
import type { TemplateSummary } from "@/lib/contract/api";

/**
 * Lexical fallback ranking (§6.6), ported from the M1 rules in lib/data/search.ts.
 * Splitting on non letters/digits instead of [^a-z0-9] keeps Devanagari words whole, so a Hindi or
 * Marathi query still scores when the AI service is unavailable.
 */
const SEPARATORS = /[^\p{L}\p{N}]+/u;

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(SEPARATORS)
    .filter((token) => token.length >= 2);

export interface RankedTemplate {
  template: TemplateSummary;
  /** 0-1, the raw token score divided by the best score in this result set. */
  score: number;
}

/**
 * Same ranking as searchTemplates, but with a normalised score, because the search response has to
 * report one per match (Appendix F.1) and the raw token score has no upper bound.
 */
export function rankTemplates(templates: readonly TemplateSummary[], query: string, limit = 8): RankedTemplate[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored: { template: TemplateSummary; score: number }[] = [];
  for (const template of templates) {
    const titleWords = template.title.toLowerCase().split(SEPARATORS).filter(Boolean);
    const summary = template.summary.toLowerCase();
    const keywords = template.keywords.map((keyword) => keyword.toLowerCase());

    let score = 0;
    for (const token of tokens) {
      if (titleWords.some((word) => word.startsWith(token))) score += 3;
      if (keywords.some((keyword) => keyword.includes(token))) score += 2;
      if (summary.includes(token)) score += 1;
    }
    if (score > 0) scored.push({ template, score });
  }

  scored.sort((a, b) => (b.score === a.score ? a.template.title.localeCompare(b.template.title) : b.score - a.score));
  const best = scored[0]?.score ?? 1;
  return scored.slice(0, limit).map((entry) => ({ template: entry.template, score: entry.score / best }));
}

export function searchTemplates(templates: readonly TemplateSummary[], query: string, limit = 8): TemplateSummary[] {
  return rankTemplates(templates, query, limit).map((entry) => entry.template);
}
