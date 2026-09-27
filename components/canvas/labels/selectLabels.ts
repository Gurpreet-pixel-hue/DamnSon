import type { MetroVM, StationVM } from "@/lib/graph/viewModel";

export const MAX_LABEL_SLOTS = 32;

/**
 * Selects and orders stations to display labels for per visual-direction §4 & E7:
 * Priority order: selected > focused > hovered > next-up > done-last > the rest.
 * (Greedy collision culling by that priority order is performed during screen projection in LabelProjector).
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

  // 1. Selected station (highest priority)
  if (
    selectedStepId &&
    stationMap.has(selectedStepId) &&
    selectedIds.size < maxSlots
  ) {
    selectedIds.add(selectedStepId);
  }

  // 2. Focused station (second priority)
  if (
    focusedStepId &&
    stationMap.has(focusedStepId) &&
    selectedIds.size < maxSlots
  ) {
    selectedIds.add(focusedStepId);
  }

  // 3. Hovered station (third priority)
  if (
    hoveredStepId &&
    stationMap.has(hoveredStepId) &&
    selectedIds.size < maxSlots
  ) {
    selectedIds.add(hoveredStepId);
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

  // 6. The rest (all remaining stations)
  for (const station of metro.stations) {
    if (selectedIds.size >= maxSlots) break;
    selectedIds.add(station.id);
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

export interface ScreenRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function rectsOverlap(a: ScreenRect, b: ScreenRect, margin = 0): boolean {
  return (
    a.minX < b.maxX + margin &&
    a.maxX > b.minX - margin &&
    a.minY < b.maxY + margin &&
    a.maxY > b.minY - margin
  );
}

export const SAFE_INSETS = {
  left: 24,
  right: 24,
  top: 88,
  bottom: 110,
};

export const CANDIDATE_Y_OFFSETS = [-64, -128, -192, 64, 128];

export type LabelDisplayMode = "full" | "compact" | "pin" | "none";

export interface PlacedLabel {
  id: string;
  mode: LabelDisplayMode;
  rect: ScreenRect;
  xOff: number;
  yOff: number;
}

export interface ProjectedStationPoint {
  id: string;
  title: string;
  lane: number;
  layer: number;
  x: number;
  y: number;
  pinX?: number;
  pinY?: number;
}

export interface ResolveLabelCollisionsInput {
  stations: StationVM[];
  projectedPoints: Map<string, ProjectedStationPoint>;
  stageHeaders?: ScreenRect[];
  viewport: { width: number; height: number };
  hoveredStepId?: string | null;
  focusedStepId?: string | null;
  selectedStepId?: string | null;
  maxSlots?: number;
}

/**
 * Pure collision pass for cards and pins per visual-direction §4, G1, and G5.
 * - Priority order: selected > focused > hovered > next-up > done-last > the rest.
 * - Stations with <= 16 total stations never use pins; they use full cards falling back to compact.
 * - When full cards collide, fallback to compact (one line, max 180px, ellipsis).
 * - A station with a card never shows a separate pin.
 * - Pins are used only on graphs with > 16 stations for stations that cannot place a card.
 * - Pins that intersect any card rect are hidden.
 * - Cards are always painted above pins.
 */
export function resolveLabelCollisions(
  input: ResolveLabelCollisionsInput
): Map<string, PlacedLabel> {
  const {
    stations,
    projectedPoints,
    stageHeaders = [],
    hoveredStepId = null,
    focusedStepId = null,
    selectedStepId = null,
    maxSlots = MAX_LABEL_SLOTS,
  } = input;

  const results = new Map<string, PlacedLabel>();
  if (stations.length === 0) return results;

  const isSmallGraph = stations.length <= 16;
  const prioritizedStations = selectLabels(
    { stations, tracks: [] },
    hoveredStepId,
    focusedStepId,
    selectedStepId,
    maxSlots
  );

  const pts: ProjectedStationPoint[] = [];
  for (const s of prioritizedStations) {
    const pt = projectedPoints.get(s.id);
    if (pt) {
      pts.push(pt);
    }
  }

  const safeMinX = SAFE_INSETS.left;
  const safeMaxX = input.viewport.width - SAFE_INSETS.right;
  const safeMinY = SAFE_INSETS.top;
  const safeMaxY = input.viewport.height - SAFE_INSETS.bottom;

  // On graphs > 16 stations, full cards only for priority stations (selected, focused, hovered, next-up)
  const priorityIds = new Set<string>();
  if (selectedStepId) priorityIds.add(selectedStepId);
  if (focusedStepId) priorityIds.add(focusedStepId);
  if (hoveredStepId) priorityIds.add(hoveredStepId);
  for (const s of stations) {
    if (s.state === "available" && s.applicability !== "optional") {
      priorityIds.add(s.id);
    }
  }

  const placedCards: PlacedLabel[] = [];
  const cardUnplaced: ProjectedStationPoint[] = [];

  // Phase 1: Place cards in priority order
  for (const p of pts) {
    const eligibleForFull = isSmallGraph || priorityIds.has(p.id);
    let placedCard: PlacedLabel | null = null;

    // 1. Try full card slots: above at -64, -128, -192 px; below at +64, +128 px
    if (eligibleForFull) {
      const fullHalfW = Math.min(
        130,
        Math.max(70, Math.round((p.title.length * 7.5 + 48) / 2))
      );
      const fullHalfH = 24;

      for (const yOff of CANDIDATE_Y_OFFSETS) {
        let cx = p.x;
        let cy = p.y + yOff;

        // Clamp candidate card into safe area (H2)
        if (cx - fullHalfW < safeMinX) {
          cx = safeMinX + fullHalfW;
        } else if (cx + fullHalfW > safeMaxX) {
          cx = safeMaxX - fullHalfW;
        }

        if (cy - fullHalfH < safeMinY) {
          cy = safeMinY + fullHalfH;
        } else if (cy + fullHalfH > safeMaxY) {
          cy = safeMaxY - fullHalfH;
        }

        const cardBox: ScreenRect = {
          minX: cx - fullHalfW,
          maxX: cx + fullHalfW,
          minY: cy - fullHalfH,
          maxY: cy + fullHalfH,
        };

        if (
          cardBox.minX < safeMinX ||
          cardBox.maxX > safeMaxX ||
          cardBox.minY < safeMinY ||
          cardBox.maxY > safeMaxY
        ) {
          continue;
        }

        if (stageHeaders.some((h) => rectsOverlap(cardBox, h, 2))) continue;
        if (placedCards.some((c) => rectsOverlap(cardBox, c.rect, 2))) continue;

        placedCard = {
          id: p.id,
          mode: "full",
          rect: cardBox,
          xOff: cx - p.x,
          yOff: cy - p.y,
        };
        break;
      }
    }

    // 2. Try compact card slots: same candidate slots
    if (!placedCard) {
      const compactHalfW = Math.min(
        90,
        Math.max(50, Math.round((p.title.length * 6.0 + 32) / 2))
      );
      const compactHalfH = 15;

      for (const yOff of CANDIDATE_Y_OFFSETS) {
        let cx = p.x;
        let cy = p.y + yOff;

        // Clamp candidate card into safe area (H2)
        if (cx - compactHalfW < safeMinX) {
          cx = safeMinX + compactHalfW;
        } else if (cx + compactHalfW > safeMaxX) {
          cx = safeMaxX - compactHalfW;
        }

        if (cy - compactHalfH < safeMinY) {
          cy = safeMinY + compactHalfH;
        } else if (cy + compactHalfH > safeMaxY) {
          cy = safeMaxY - compactHalfH;
        }

        const cardBox: ScreenRect = {
          minX: cx - compactHalfW,
          maxX: cx + compactHalfW,
          minY: cy - compactHalfH,
          maxY: cy + compactHalfH,
        };

        if (
          cardBox.minX < safeMinX ||
          cardBox.maxX > safeMaxX ||
          cardBox.minY < safeMinY ||
          cardBox.maxY > safeMaxY
        ) {
          continue;
        }

        if (stageHeaders.some((h) => rectsOverlap(cardBox, h, 1))) continue;
        if (placedCards.some((c) => rectsOverlap(cardBox, c.rect, 1))) continue;

        placedCard = {
          id: p.id,
          mode: "compact",
          rect: cardBox,
          xOff: cx - p.x,
          yOff: cy - p.y,
        };
        break;
      }
    }

    if (placedCard) {
      placedCards.push(placedCard);
    } else {
      cardUnplaced.push(p);
    }
  }

  // Phase 2: Place pins for stations without a card (only on graphs with > 16 stations)
  const placedPins: PlacedLabel[] = [];
  const unplaced: ProjectedStationPoint[] = [];

  for (const p of cardUnplaced) {
    if (!isSmallGraph) {
      const px = p.pinX ?? p.x;
      const py = p.pinY ?? p.y + 24;
      const pinBox: ScreenRect = {
        minX: px - 14,
        maxX: px + 14,
        minY: py - 48,
        maxY: py,
      };

      const intersectsCard = placedCards.some((c) => rectsOverlap(pinBox, c.rect, 0));
      const intersectsHeader = stageHeaders.some((h) => rectsOverlap(pinBox, h, 0));
      const intersectsPin = placedPins.some((pin) => rectsOverlap(pinBox, pin.rect, 0));

      if (!intersectsCard && !intersectsHeader && !intersectsPin) {
        placedPins.push({ id: p.id, mode: "pin", rect: pinBox, xOff: 0, yOff: 0 });
        continue;
      }
    }

    unplaced.push(p);
  }

  for (const c of placedCards) {
    results.set(c.id, c);
  }
  for (const pin of placedPins) {
    results.set(pin.id, pin);
  }
  for (const u of unplaced) {
    results.set(u.id, {
      id: u.id,
      mode: "none",
      rect: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      xOff: 0,
      yOff: 0,
    });
  }

  return results;
}

