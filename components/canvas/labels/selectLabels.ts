import type { MetroVM, StationVM } from "@/lib/graph/viewModel";

export const MAX_LABEL_SLOTS = 6;

/**
 * Selects up to 6 stations to display labels for:
 * 1. Hovered station (highest priority)
 * 2. Focused station (second priority, if distinct from hovered)
 * 3. Next-up stations (state === 'available' and applicability !== 'optional')
 *
 * Ensures no duplicates and strictly respects the 6-station cap.
 */
export function selectLabels(
  metro: MetroVM,
  hoveredStepId: string | null,
  focusedStepId: string | null,
  maxSlots = MAX_LABEL_SLOTS
): StationVM[] {
  const stationMap = new Map<string, StationVM>(
    metro.stations.map((s) => [s.id, s])
  );
  const selectedIds = new Set<string>();

  if (hoveredStepId && stationMap.has(hoveredStepId)) {
    selectedIds.add(hoveredStepId);
  }

  if (
    focusedStepId &&
    stationMap.has(focusedStepId) &&
    selectedIds.size < maxSlots
  ) {
    selectedIds.add(focusedStepId);
  }

  for (const station of metro.stations) {
    if (selectedIds.size >= maxSlots) break;
    if (station.state === "available" && station.applicability !== "optional") {
      selectedIds.add(station.id);
    }
  }

  const result: StationVM[] = [];
  for (const id of selectedIds) {
    const station = stationMap.get(id);
    if (station) {
      result.push(station);
    }
  }

  return result;
}
