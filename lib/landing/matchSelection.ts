import type { TemplateSummary } from "@/lib/contract/api";

export interface RankedMatch extends TemplateSummary {
  score?: number;
  isBestMatch?: boolean;
}

export interface MatchSelectionState {
  matches: RankedMatch[];
  selectedMatch: RankedMatch | null;
  hasSingleMatch: boolean;
  hasMultipleMatches: boolean;
}

/**
 * Selects and decorates top matches (up to 3) for landing search results (§9.3).
 * Marks the first match as best match.
 */
export function selectLandingMatches(
  matches: Array<TemplateSummary & { score?: number }>,
  selectedTaskId?: string
): MatchSelectionState {
  if (!matches || matches.length === 0) {
    return {
      matches: [],
      selectedMatch: null,
      hasSingleMatch: false,
      hasMultipleMatches: false,
    };
  }

  // Take up to top 3 matches
  const topMatches: RankedMatch[] = matches.slice(0, 3).map((m, index) => ({
    ...m,
    isBestMatch: index === 0,
  }));

  const selected = selectedTaskId
    ? topMatches.find((m) => m.taskId === selectedTaskId) ?? topMatches[0]!
    : topMatches[0]!;

  return {
    matches: topMatches,
    selectedMatch: selected,
    hasSingleMatch: topMatches.length === 1,
    hasMultipleMatches: topMatches.length > 1,
  };
}
