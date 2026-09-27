import type { FeeSummary, TimeSummary } from "./totals";
import type { OfficeTrip } from "./trips";

export function formatINR(amount: number): string {
  return "₹" + amount.toLocaleString("en-IN");
}

/**
 * Format fee summary according to PRD §8.8 and FE-3 P5 copy rules:
 * - "Free" only when min = max = 0, unconfirmedCount = 0, mayApplyCount = 0 and there are no annual fees.
 * - Otherwise "₹0" plus the qualifiers, e.g. "₹0 + 2 fees to confirm".
 * - Conditional amounts read "(up to ₹X more if conditions apply)".
 * - Annual fees reported per year (e.g. "+ ₹500/yr").
 */
export function formatFees(summary: FeeSummary): string {
  const isFree =
    summary.minINR === 0 &&
    summary.maxINR === 0 &&
    summary.unconfirmedCount === 0 &&
    summary.mayApplyCount === 0 &&
    summary.annualMinINR === 0 &&
    summary.annualMaxINR === 0 &&
    summary.annualUnconfirmedCount === 0;

  if (isFree) {
    return "Free";
  }

  // Base one-time fee
  let base = "";
  // Exclude may_apply amounts from the base range display
  const effectiveMaxOneTime = summary.maxINR - (summary.conditionalMaxINR || 0);

  if (summary.minINR === 0 && effectiveMaxOneTime === 0) {
    base = "₹0";
  } else if (summary.minINR === effectiveMaxOneTime) {
    base = formatINR(summary.minINR);
  } else {
    base = `${formatINR(summary.minINR)}–${formatINR(effectiveMaxOneTime)}`;
  }

  // Annual fees
  if (summary.annualMaxINR > 0) {
    if (summary.annualMinINR === summary.annualMaxINR) {
      base += ` + ${formatINR(summary.annualMinINR)}/yr`;
    } else {
      base += ` + ${formatINR(summary.annualMinINR)}–${formatINR(summary.annualMaxINR)}/yr`;
    }
  } else if (summary.annualUnconfirmedCount > 0) {
    base += ` + ${summary.annualUnconfirmedCount} annual ${summary.annualUnconfirmedCount === 1 ? "fee" : "fees"} to confirm`;
  }

  // Unconfirmed one-time fees
  if (summary.unconfirmedCount > 0) {
    base += ` + ${summary.unconfirmedCount} ${summary.unconfirmedCount === 1 ? "fee" : "fees"} to confirm`;
  }

  // Conditional / may-apply amount
  if (summary.mayApplyCount > 0 && summary.conditionalMaxINR > 0) {
    base += ` (up to ${formatINR(summary.conditionalMaxINR)} more if conditions apply)`;
  }

  return base;
}

/**
 * Format time summary according to PRD §8.8 and FE-3 P1 rules:
 * Returns e.g. "2–7 days", "10 days (open-ended)", or with relativeTo anchor: "2–9 days (2–7 days after Incorporation)".
 */
export function formatTime(
  summary: TimeSummary,
  titles?: Map<string, string> | Record<string, string>
): string {
  if (
    summary.minDays === 0 &&
    summary.maxDays === 0 &&
    !summary.openEnded &&
    summary.unknownCount === 0
  ) {
    return "Immediate";
  }

  let base = "";
  if (summary.minDays === summary.maxDays) {
    base = `${summary.minDays} ${summary.minDays === 1 ? "day" : "days"}`;
  } else {
    base = `${summary.minDays}–${summary.maxDays} days`;
  }

  if (summary.openEnded) {
    base += " (open-ended)";
  }

  if (summary.relativeTo && summary.relative) {
    const title =
      titles instanceof Map
        ? titles.get(summary.relativeTo)
        : titles?.[summary.relativeTo] ?? summary.relativeTo;

    if (title) {
      const relRange =
        summary.relative.minDays === summary.relative.maxDays
          ? `${summary.relative.minDays} ${summary.relative.minDays === 1 ? "day" : "days"}`
          : `${summary.relative.minDays}–${summary.relative.maxDays} days`;
      base += ` (${relRange} after ${title})`;
    }
  }

  return base;
}

/**
 * Format next up station titles according to FE-3 P6 rules:
 * Show at most 2 titles, then "+N more". When every action step is done: "All steps done".
 */
export function formatNextUp(
  ids: string[],
  titles?: Map<string, string> | Record<string, string>
): string {
  if (ids.length === 0) {
    return "All steps done";
  }

  const getTitle = (id: string): string => {
    if (titles instanceof Map) {
      return titles.get(id) ?? id;
    }
    return titles?.[id] ?? id;
  };

  if (ids.length === 1) {
    return getTitle(ids[0]!);
  }
  if (ids.length === 2) {
    return `${getTitle(ids[0]!)}, ${getTitle(ids[1]!)}`;
  }
  return `${getTitle(ids[0]!)}, ${getTitle(ids[1]!)} +${ids.length - 2} more`;
}

/**
 * Format office visits according to FE-3 P7 rules:
 * - "No office visits" when there are no in-person trips.
 * - Never write "100 % online" unless every remaining action step is online.
 */
export function formatOfficeVisits(
  trips: OfficeTrip[],
  options?: { allRemainingOnline?: boolean }
): string {
  if (trips.length === 0) {
    if (options?.allRemainingOnline) {
      return "100 % online";
    }
    return "No office visits";
  }

  if (trips.length === 1) {
    return "1 office visit";
  }

  return `${trips.length} office visits`;
}

export interface TileValue {
  value: string;
  subtext?: string;
  fullText: string;
}

/**
 * Derives honest fee tile per FE-4 Fixes (commit 2):
 * - Known fee range 0–0 with unconfirmed fees -> "To confirm" + "N fees to confirm", never "₹0".
 * - Free only when everything is 0 with no unconfirmed/annual fees.
 */
export function deriveFeeTile(summary: FeeSummary): TileValue {
  const isFree =
    summary.minINR === 0 &&
    summary.maxINR === 0 &&
    summary.unconfirmedCount === 0 &&
    summary.mayApplyCount === 0 &&
    summary.annualMinINR === 0 &&
    summary.annualMaxINR === 0 &&
    summary.annualUnconfirmedCount === 0;

  if (isFree) {
    return { value: "Free", fullText: "Free" };
  }

  const effectiveMaxOneTime = summary.maxINR - (summary.conditionalMaxINR || 0);
  const feesText = formatFees(summary);

  // When known fee range is 0–0 and any fee is still unconfirmed, show "To confirm" with "N fees to confirm" underneath, never "₹0".
  if (summary.minINR === 0 && effectiveMaxOneTime === 0) {
    if (summary.unconfirmedCount > 0 || summary.annualUnconfirmedCount > 0) {
      const totalUnconfirmed = summary.unconfirmedCount + summary.annualUnconfirmedCount;
      return {
        value: "To confirm",
        subtext: `${totalUnconfirmed} ${totalUnconfirmed === 1 ? "fee" : "fees"} to confirm`,
        fullText: feesText,
      };
    }
    return {
      value: "₹0",
      fullText: feesText,
    };
  }

  let val = "";
  if (summary.minINR === effectiveMaxOneTime) {
    val = formatINR(summary.minINR);
  } else {
    val = `${formatINR(summary.minINR)}–${formatINR(effectiveMaxOneTime)}`;
  }

  let sub = "";
  if (summary.unconfirmedCount > 0) {
    sub = `+${summary.unconfirmedCount} to confirm`;
  } else if (summary.annualMaxINR > 0 || summary.annualUnconfirmedCount > 0) {
    sub = "per year";
  } else if (summary.mayApplyCount > 0 && summary.conditionalMaxINR > 0) {
    sub = `up to ${formatINR(summary.conditionalMaxINR)} more if conditions apply`;
  }

  return {
    value: val,
    subtext: sub || undefined,
    fullText: feesText,
  };
}

/**
 * Derives honest time tile per FE-4 Fixes (commit 2):
 * - Known range 0–x and some durations unknown -> "x+ days" + "N unknown", not "0–x days".
 * - Known range 0–0 and some durations unknown -> "To confirm" + "N unknown".
 */
export function deriveTimeTile(
  summary: TimeSummary,
  stepTitles?: Map<string, string> | Record<string, string>
): TileValue {
  const timeText = formatTime(summary, stepTitles);

  if (
    summary.minDays === 0 &&
    summary.maxDays === 0 &&
    !summary.openEnded &&
    summary.unknownCount === 0
  ) {
    return { value: "Immediate", fullText: "Immediate" };
  }

  // Known range 0–x with unknown durations -> "x+ days" with "N unknown"
  if (summary.minDays === 0 && summary.maxDays > 0 && summary.unknownCount > 0) {
    return {
      value: `${summary.maxDays}+ days`,
      subtext: `${summary.unknownCount} unknown`,
      fullText: timeText,
    };
  }

  // Known range 0–0 with unknown durations
  if (summary.minDays === 0 && summary.maxDays === 0 && summary.unknownCount > 0) {
    return {
      value: "To confirm",
      subtext: `${summary.unknownCount} unknown`,
      fullText: timeText,
    };
  }

  let val = "";
  if (summary.minDays === summary.maxDays) {
    val = `${summary.minDays} ${summary.minDays === 1 ? "day" : "days"}`;
  } else {
    val = `${summary.minDays}–${summary.maxDays} days`;
  }

  let sub = "";
  if (summary.openEnded) {
    sub = "open-ended";
  } else if (summary.unknownCount > 0) {
    sub = `+${summary.unknownCount} unknown`;
  }

  return {
    value: val,
    subtext: sub || undefined,
    fullText: timeText,
  };
}
