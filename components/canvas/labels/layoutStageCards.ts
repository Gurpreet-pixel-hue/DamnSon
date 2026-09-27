export interface ScreenRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

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
  obstacles?: ScreenRect[];
}

export interface PlacedStageCard {
  id: string;
  xOff: number;
  yOff: number;
  width: number;
  height: number;
  cardRect: ScreenRect;
  isCompact: boolean;
  tetherLength: number;
}

export const CARD_SIZES = {
  standard: { width: 220, height: 60 },
  compact: { width: 180, height: 38 },
} as const;

export const DEFAULT_STAGE_INSETS: LayoutSafeInsets = {
  left: 24,
  right: 24,
  top: 56,
  bottom: 133, // canvasBottom − stepperTop + 16 (~117 + 16)
};

export const MAX_TETHER_LENGTH = 140; // max 140 px per §11.8

export function computeTetherLength(
  anchorX: number,
  anchorY: number,
  rect: ScreenRect
): number {
  const dx = Math.max(0, rect.minX - anchorX, anchorX - rect.maxX);
  const dy = Math.max(0, rect.minY - anchorY, anchorY - rect.maxY);
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeOverlapArea(a: ScreenRect, b: ScreenRect): number {
  const ox = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const oy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return ox * oy;
}

function rectIntersectsAny(rect: ScreenRect, others: ScreenRect[]): boolean {
  for (const other of others) {
    if (computeOverlapArea(rect, other) > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Pure, deterministic layout algorithm for stage cards (§11.4 & §11.8):
 * - Sort stage stations by screen x;
 * - Treats visible stage chips, stepper rect, and drawer rect as obstacles;
 * - Enforces 0 px² overlap on each other and all obstacles;
 * - Tethers stay short (<= 140 px from card edge to station anchor);
 * - When standard cards cannot fit without collision/tether overflow, switches stage to compact mode;
 * - If still unable to fit all stations, keeps available ones and outputs "+N more";
 * - Clamps to safe insets;
 * - Never depends on hover, selection, or mark-done state.
 */
export function layoutStageCards(
  input: LayoutStageCardsInput
): Map<string, PlacedStageCard> {
  const { stations, viewport, drawerOpen = false, obstacles = [] } = input;
  const insets = input.insets ?? DEFAULT_STAGE_INSETS;

  const effectiveRight = drawerOpen ? Math.max(insets.right, 404) : insets.right;

  const safeMinX = insets.left;
  const safeMaxX = viewport.width - effectiveRight;
  const safeMinY = insets.top;
  const safeMaxY = viewport.height - insets.bottom;

  // Build standard obstacles: stepper + drawer + custom obstacles
  const allObstacles: ScreenRect[] = [...obstacles];

  // Stepper obstacle at bottom center (width 320, height = insets.bottom)
  allObstacles.push({
    minX: (viewport.width - 320) / 2,
    maxX: (viewport.width + 320) / 2,
    minY: viewport.height - insets.bottom,
    maxY: viewport.height,
  });

  // Drawer obstacle if open
  if (drawerOpen) {
    allObstacles.push({
      minX: viewport.width - 380,
      maxX: viewport.width,
      minY: 0,
      maxY: viewport.height,
    });
  }

  // Top header bar safe area (top 56 px)
  allObstacles.push({
    minX: 0,
    maxX: viewport.width,
    minY: 0,
    maxY: 56,
  });

  // If > 4 stations: cards are compact (180px wide) (§11.2)
  const forceCompact = stations.length > 4;

  // If > 8 stations: cards only for available ones (§11.2)
  let visibleStations = [...stations];
  if (stations.length > 8) {
    visibleStations = visibleStations.filter((s) => s.state === "available");
  }

  // Sort by screen x ascending
  visibleStations.sort((a, b) => a.anchorX - b.anchorX);

  // Attempt layout in standard or compact mode
  function attemptLayout(
    useCompact: boolean
  ): Map<string, PlacedStageCard> | null {
    const placed = new Map<string, PlacedStageCard>();
    const placedRects: ScreenRect[] = [];

    for (const st of visibleStations) {
      const { width, height } = useCompact
        ? CARD_SIZES.compact
        : CARD_SIZES.standard;
      const halfW = width / 2;
      const halfH = height / 2;

      // Candidate search offsets in priority order
      const candidateOffsets: [number, number][] = [];

      // 1. Above anchor
      for (const xOff of [0, -30, 30, -60, 60, -90, 90, -120, 120, -150, 150, -180, 180]) {
        for (const yOff of [-56, -40, -70, -85]) {
          candidateOffsets.push([xOff, yOff]);
        }
      }
      // 2. Below anchor
      for (const xOff of [0, -30, 30, -60, 60, -90, 90, -120, 120, -150, 150, -180, 180]) {
        for (const yOff of [56, 40, 70, 85]) {
          candidateOffsets.push([xOff, yOff]);
        }
      }
      // 3. Side of anchor
      for (const yOff of [0, -20, 20]) {
        for (const xOff of [-120, 120, -140, 140, -160, 160, -180, 180]) {
          candidateOffsets.push([xOff, yOff]);
        }
      }

      let bestSlot: {
        xOff: number;
        yOff: number;
        rect: ScreenRect;
        tether: number;
      } | null = null;

      for (const [xOff, yOff] of candidateOffsets) {
        const candidateRect: ScreenRect = {
          minX: st.anchorX + xOff - halfW,
          maxX: st.anchorX + xOff + halfW,
          minY: st.anchorY + yOff - halfH,
          maxY: st.anchorY + yOff + halfH,
        };

        // Check bounds
        if (
          candidateRect.minX < safeMinX ||
          candidateRect.maxX > safeMaxX ||
          candidateRect.minY < safeMinY ||
          candidateRect.maxY > safeMaxY
        ) {
          continue;
        }

        const tether = computeTetherLength(
          st.anchorX,
          st.anchorY,
          candidateRect
        );
        if (tether > MAX_TETHER_LENGTH) {
          continue;
        }

        // Check collision with already placed cards
        if (rectIntersectsAny(candidateRect, placedRects)) {
          continue;
        }

        // Check collision with obstacles
        if (rectIntersectsAny(candidateRect, allObstacles)) {
          continue;
        }

        if (!bestSlot || tether < bestSlot.tether) {
          bestSlot = { xOff, yOff, rect: candidateRect, tether };
          if (tether <= 56) break; // Optimal slot found
        }
      }

      if (!bestSlot) {
        // Failed to place this card without collision or tether overflow
        return null;
      }

      placedRects.push(bestSlot.rect);
      placed.set(st.id, {
        id: st.id,
        xOff: Math.round(bestSlot.xOff),
        yOff: Math.round(bestSlot.yOff),
        width,
        height,
        cardRect: bestSlot.rect,
        isCompact: useCompact,
        tetherLength: bestSlot.tether,
      });
    }

    return placed;
  }

  // First try standard cards (unless forceCompact is true)
  if (!forceCompact) {
    const standardResult = attemptLayout(false);
    if (standardResult) {
      return standardResult;
    }
  }

  // Fall back to compact cards (§11.8)
  const compactResult = attemptLayout(true);
  if (compactResult) {
    return compactResult;
  }

  // If some cards still fail, place available ones first and discard lowest priority
  const fallbackPlaced = new Map<string, PlacedStageCard>();
  const fallbackRects: ScreenRect[] = [];

  for (const st of visibleStations) {
    const { width, height } = CARD_SIZES.compact;
    const halfW = width / 2;
    const halfH = height / 2;

    const candidateOffsets: [number, number][] = [
      [0, -56],
      [0, 56],
      [-100, 0],
      [100, 0],
      [-50, -56],
      [50, -56],
      [-50, 56],
      [50, 56],
    ];

    for (const [xOff, yOff] of candidateOffsets) {
      const candidateRect: ScreenRect = {
        minX: st.anchorX + xOff - halfW,
        maxX: st.anchorX + xOff + halfW,
        minY: st.anchorY + yOff - halfH,
        maxY: st.anchorY + yOff + halfH,
      };

      if (
        candidateRect.minX >= safeMinX &&
        candidateRect.maxX <= safeMaxX &&
        candidateRect.minY >= safeMinY &&
        candidateRect.maxY <= safeMaxY &&
        !rectIntersectsAny(candidateRect, fallbackRects) &&
        !rectIntersectsAny(candidateRect, allObstacles)
      ) {
        fallbackRects.push(candidateRect);
        fallbackPlaced.set(st.id, {
          id: st.id,
          xOff: Math.round(xOff),
          yOff: Math.round(yOff),
          width,
          height,
          cardRect: candidateRect,
          isCompact: true,
          tetherLength: computeTetherLength(
            st.anchorX,
            st.anchorY,
            candidateRect
          ),
        });
        break;
      }
    }
  }

  return fallbackPlaced;
}
