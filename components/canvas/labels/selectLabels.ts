import type { MetroVM, StationVM } from "@/lib/graph/viewModel";

export const MAX_LABEL_SLOTS = 32;

/**
 * Selects stations to display labels for per visual-direction §4:
 * - If stations <= 16: all of them.
 * - If stations > 16: prioritized list of [hovered, focused, selected, next-up, last done].
 *   (Greedy collision culling by that priority order is performed during screen projection in LabelProjector).
 */
export function selectLabels(
  metro: MetroVM,
  hoveredStepId: string | null,
  focusedStepId: string | null,
  selectedStepId: string | null = null,
  maxSlots = MAX_LABEL_SLOTS
): StationVM[] {
  if (metro.stations.length === 0) return [];

  const stationMap = new Map<string, StationVM>(
    metro.stations.map((s) => [s.id, s])
  );
  const selectedIds = new Set<string>();

  // 1. Hovered station (highest priority)
  if (hoveredStepId && stationMap.has(hoveredStepId)) {
    selectedIds.add(hoveredStepId);
  }

  // 2. Focused station (second priority)
  if (
    focusedStepId &&
    stationMap.has(focusedStepId) &&
    selectedIds.size < maxSlots
  ) {
    selectedIds.add(focusedStepId);
  }

  // 3. Selected station (third priority)
  if (
    selectedStepId &&
    stationMap.has(selectedStepId) &&
    selectedIds.size < maxSlots
  ) {
    selectedIds.add(selectedStepId);
  }

  // 4. Next-up stations (state === 'available' and applicability !== 'optional')
  for (const station of metro.stations) {
    if (selectedIds.size >= maxSlots) break;
    if (station.state === "available" && station.applicability !== "optional") {
      selectedIds.add(station.id);
    }
  }

  // 5. Last done station
  if (selectedIds.size < maxSlots) {
    for (let i = metro.stations.length - 1; i >= 0; i--) {
      const station = metro.stations[i]!;
      if (station.state === "done") {
        selectedIds.add(station.id);
        break;
      }
    }
  }

  // 6. If total stations <= 16, include all remaining stations
  if (metro.stations.length <= 16) {
    for (const station of metro.stations) {
      if (selectedIds.size >= maxSlots) break;
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

