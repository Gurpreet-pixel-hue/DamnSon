export interface StageStationInput {
  id: string;
  title: string;
  anchorX: number;
  anchorY: number;
  state?: "done" | "available" | "locked";
  applicability?: "applies" | "may_apply" | "optional";
  isCompact?: boolean;
}

export interface LayoutSafeInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface LayoutStageCardsInput {
  stations: StageStationInput[];
  viewport: { width: number; height: number };
  insets?: LayoutSafeInsets;
  drawerOpen?: boolean;
}

export interface PlacedStageCard {
  id: string;
  xOff: number;
  yOff: number;
  width: number;
  height: number;
  cardRect: { minX: number; maxX: number; minY: number; maxY: number };
  isCompact: boolean;
}

export const CARD_SIZES = {
  standard: { width: 220, height: 60 },
  compact: { width: 180, height: 38 },
} as const;

export const DEFAULT_STAGE_INSETS: LayoutSafeInsets = {
  left: 16,
  right: 16,
  top: 56,
  bottom: 52,
};

function boxesOverlap(
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number },
  padding = 6
): boolean {
  return !(
    a.maxX + padding <= b.minX ||
    a.minX - padding >= b.maxX ||
    a.maxY + padding <= b.minY ||
    a.minY - padding >= b.maxY
  );
}

/**
 * Pure, deterministic layout algorithm for stage cards (§11.4):
 * - Sort stage stations by screen x;
 * - If > 4 stations, use compact card mode (180px wide);
 * - If > 8 stations, show only available ones;
 * - Put each card 56 px above its anchor;
 * - On overlap with previous card, try 56 px below, then push sideways by overlap;
 * - Clamp to safe insets;
 * - Never depends on hover, selection, or mark-done state.
 */
export function layoutStageCards(
  input: LayoutStageCardsInput
): Map<string, PlacedStageCard> {
  const { stations, viewport, drawerOpen = false } = input;
  const insets = input.insets ?? DEFAULT_STAGE_INSETS;

  const effectiveRight = drawerOpen ? insets.right + 380 : insets.right;

  const safeMinX = insets.left;
  const safeMaxX = viewport.width - effectiveRight;
  const safeMinY = insets.top;
  const safeMaxY = viewport.height - insets.bottom;

  // If > 4 stations: cards are compact (180px wide, no mode line) (§11.2)
  const isCompactAll = stations.length > 4;

  // If > 8 stations: cards only for available ones (§11.2)
  let visibleStations = [...stations];
  if (stations.length > 8) {
    visibleStations = visibleStations.filter((s) => s.state === "available");
  }

  // Sort by screen x ascending
  visibleStations.sort((a, b) => a.anchorX - b.anchorX);

  const placed = new Map<string, PlacedStageCard>();
  const placedRects: { minX: number; maxX: number; minY: number; maxY: number }[] = [];

  for (const st of visibleStations) {
    const isCompact = st.isCompact ?? isCompactAll;
    const { width, height } = isCompact
      ? CARD_SIZES.compact
      : CARD_SIZES.standard;
    const halfW = width / 2;
    const halfH = height / 2;

    // 1. Try 56 px above anchor
    let yOff = -56;
    let xOff = 0;

    let candidateRect = {
      minX: st.anchorX + xOff - halfW,
      maxX: st.anchorX + xOff + halfW,
      minY: st.anchorY + yOff - halfH,
      maxY: st.anchorY + yOff + halfH,
    };

    let hasOverlap = placedRects.some((r) => boxesOverlap(candidateRect, r));

    // 2. On overlap, try 56 px below anchor
    if (hasOverlap) {
      yOff = 56;
      candidateRect = {
        minX: st.anchorX + xOff - halfW,
        maxX: st.anchorX + xOff + halfW,
        minY: st.anchorY + yOff - halfH,
        maxY: st.anchorY + yOff + halfH,
      };
      hasOverlap = placedRects.some((r) => boxesOverlap(candidateRect, r));
    }

    // 3. If still overlapping, push sideways by overlap
    if (hasOverlap) {
      // Find the overlapping rect with largest maxX
      let maxOverlapX = candidateRect.minX;
      for (const r of placedRects) {
        if (boxesOverlap(candidateRect, r)) {
          if (r.maxX > maxOverlapX) {
            maxOverlapX = r.maxX;
          }
        }
      }
      const pushX = maxOverlapX + 12 - candidateRect.minX;
      xOff += pushX;
      candidateRect = {
        minX: candidateRect.minX + pushX,
        maxX: candidateRect.maxX + pushX,
        minY: candidateRect.minY,
        maxY: candidateRect.maxY,
      };
    }

    // 4. Clamp to safe insets
    if (candidateRect.minX < safeMinX) {
      const shift = safeMinX - candidateRect.minX;
      candidateRect.minX += shift;
      candidateRect.maxX += shift;
      xOff += shift;
    } else if (candidateRect.maxX > safeMaxX) {
      const shift = candidateRect.maxX - safeMaxX;
      candidateRect.minX -= shift;
      candidateRect.maxX -= shift;
      xOff -= shift;
    }

    if (candidateRect.minY < safeMinY) {
      const shift = safeMinY - candidateRect.minY;
      candidateRect.minY += shift;
      candidateRect.maxY += shift;
      yOff += shift;
    } else if (candidateRect.maxY > safeMaxY) {
      const shift = candidateRect.maxY - safeMaxY;
      candidateRect.minY -= shift;
      candidateRect.maxY -= shift;
      yOff -= shift;
    }

    placedRects.push(candidateRect);
    placed.set(st.id, {
      id: st.id,
      xOff: Math.round(xOff),
      yOff: Math.round(yOff),
      width,
      height,
      cardRect: candidateRect,
      isCompact,
    });
  }

  return placed;
}
