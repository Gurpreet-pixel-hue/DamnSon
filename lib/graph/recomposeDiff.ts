import type { ComposedStep } from "@/lib/contract/compose";

export interface RecomposeDiffResult {
  added: ComposedStep[];
  removed: ComposedStep[];
  toastMessage: string | null;
}

function formatStationNames(steps: readonly ComposedStep[]): string {
  if (steps.length === 0) return "";
  if (steps.length <= 3) {
    return steps.map((s) => s.title).join(", ");
  }
  const firstThree = steps.slice(0, 3).map((s) => s.title).join(", ");
  const remaining = steps.length - 3;
  return `${firstThree} (+${remaining} more)`;
}

/**
 * Diffs steps across journey compositions and formats user-facing toast text (PRD §8.6 & Amendment 4).
 * Format: "Added: A, B · Removed: C", at most 3 names each, then "+N more".
 */
export function computeRecomposeDiff(
  prevSteps: readonly ComposedStep[],
  nextSteps: readonly ComposedStep[]
): RecomposeDiffResult {
  const prevMap = new Map(prevSteps.map((s) => [s.id, s]));
  const nextMap = new Map(nextSteps.map((s) => [s.id, s]));

  const added = nextSteps.filter((s) => !prevMap.has(s.id));
  const removed = prevSteps.filter((s) => !nextMap.has(s.id));

  let toastMessage: string | null = null;
  if (added.length > 0 && removed.length > 0) {
    toastMessage = `Added: ${formatStationNames(added)} · Removed: ${formatStationNames(removed)}`;
  } else if (added.length > 0) {
    toastMessage = `Added: ${formatStationNames(added)}`;
  } else if (removed.length > 0) {
    toastMessage = `Removed: ${formatStationNames(removed)}`;
  }

  return {
    added,
    removed,
    toastMessage,
  };
}

export { clampFocusStage } from "./journeyDiff";
