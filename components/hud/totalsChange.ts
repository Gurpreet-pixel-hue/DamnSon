import type { JourneySummaryValues } from "./SummaryBar";

export interface TotalsChange {
  label: string;
  before: string;
  after: string;
}

/** Summary figures (next up, fees, time, office visits) whose text changed between two compositions. */
export function compareTotals(before: JourneySummaryValues, after: JourneySummaryValues): TotalsChange[] {
  const pairs: [string, string, string][] = [
    ["Next up", before.nextUpTile.fullText, after.nextUpTile.fullText],
    ["Fees", before.feesTile.fullText, after.feesTile.fullText],
    ["Time", before.timeTile.fullText, after.timeTile.fullText],
    ["Office visits", before.visitsTile.fullText, after.visitsTile.fullText],
  ];
  return pairs.filter(([, b, a]) => b !== a).map(([label, b, a]) => ({ label, before: b, after: a }));
}
