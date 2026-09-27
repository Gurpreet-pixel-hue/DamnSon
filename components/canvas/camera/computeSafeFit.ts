/**
 * computeSafeFit
 *
 * Pure TypeScript helper to calculate 2D safe area fitting for screen elements
 * (stations, pins, card anchors, stage headers).
 * Visual direction §5 / F4.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface SafeInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SafeBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface SafeFitResult {
  fits: boolean;
  scale: number;
  distanceMultiplier: number;
  coverageWidth: number;
  coverageHeight: number;
  pointsBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
  safeBounds: SafeBounds;
  fittedPoints: Point2D[];
}

export const DEFAULT_SAFE_INSETS: SafeInsets = {
  left: 24,
  right: 24,
  top: 88,
  bottom: 110,
};

export interface ScreenRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function computeSafeFit(
  points2D: Point2D[],
  viewport: Viewport,
  insets: SafeInsets = DEFAULT_SAFE_INSETS
): SafeFitResult {
  const safeBounds: SafeBounds = {
    minX: insets.left,
    maxX: viewport.width - insets.right,
    minY: insets.top,
    maxY: viewport.height - insets.bottom,
    width: Math.max(0, viewport.width - insets.left - insets.right),
    height: Math.max(0, viewport.height - insets.top - insets.bottom),
  };

  if (points2D.length === 0) {
    return {
      fits: true,
      scale: 1,
      distanceMultiplier: 1,
      coverageWidth: 0,
      coverageHeight: 0,
      pointsBounds: {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
        width: 0,
        height: 0,
        centerX: 0,
        centerY: 0,
      },
      safeBounds,
      fittedPoints: [],
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of points2D) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const pWidth = maxX - minX;
  const pHeight = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const fits =
    minX >= safeBounds.minX &&
    maxX <= safeBounds.maxX &&
    minY >= safeBounds.minY &&
    maxY <= safeBounds.maxY;

  // Viewport projection center
  const vpCenterX = viewport.width / 2;
  const vpCenterY = viewport.height / 2;

  // Scale needed relative to viewport center so every point lands in safeBounds
  let scale = 1.0;

  for (const pt of points2D) {
    const dx = pt.x - vpCenterX;
    const dy = pt.y - vpCenterY;

    if (dx > 0) {
      const maxDx = safeBounds.maxX - vpCenterX;
      if (maxDx > 0 && dx * scale > maxDx) {
        scale = maxDx / dx;
      }
    } else if (dx < 0) {
      const minDx = safeBounds.minX - vpCenterX;
      if (minDx < 0 && dx * scale < minDx) {
        scale = minDx / dx;
      }
    }

    if (dy > 0) {
      const maxDy = safeBounds.maxY - vpCenterY;
      if (maxDy > 0 && dy * scale > maxDy) {
        scale = maxDy / dy;
      }
    } else if (dy < 0) {
      const minDy = safeBounds.minY - vpCenterY;
      if (minDy < 0 && dy * scale < minDy) {
        scale = minDy / dy;
      }
    }
  }

  // Clamping scale between 0.1 and 1.0 (never zoom in past 1.0)
  const effectiveScale = fits ? 1.0 : Math.max(0.1, Math.min(1.0, scale));
  const distanceMultiplier = 1 / effectiveScale;

  const fittedPoints: Point2D[] = points2D.map((pt) => ({
    x: vpCenterX + (pt.x - vpCenterX) * effectiveScale,
    y: vpCenterY + (pt.y - vpCenterY) * effectiveScale,
  }));

  const coverageWidth = safeBounds.width > 0 ? pWidth / safeBounds.width : 0;
  const coverageHeight = safeBounds.height > 0 ? pHeight / safeBounds.height : 0;

  return {
    fits,
    scale: effectiveScale,
    distanceMultiplier,
    coverageWidth,
    coverageHeight,
    pointsBounds: {
      minX,
      maxX,
      minY,
      maxY,
      width: pWidth,
      height: pHeight,
      centerX,
      centerY,
    },
    safeBounds,
    fittedPoints,
  };
}

export interface TwoPassFitInput {
  stationPoints: Point2D[];
  placedCardRects?: ScreenRect[];
  headerRects?: ScreenRect[];
  viewport: Viewport;
  insets?: SafeInsets;
  marginPercent?: number; // 0.08 (8%) per H2
}

export interface TwoPassFitResult {
  pass1: SafeFitResult;
  pass2: SafeFitResult;
  unionBounds: ScreenRect;
  effectiveDistanceMultiplier: number;
  fitsInSafeArea: boolean;
  fitsWithMargin: boolean;
}

/**
 * Two-pass safe fit per visual-direction §5 & H2:
 * 1. fit the stations;
 * 2. project and measure the union of the placed card rects plus the headers;
 * 3. refit so that union sits inside the safe area with an 8 % margin (at most 2 iterations).
 */
export function computeTwoPassSafeFit(input: TwoPassFitInput): TwoPassFitResult {
  const insets = input.insets ?? DEFAULT_SAFE_INSETS;
  const marginPercent = input.marginPercent ?? 0.08;

  // Pass 1: fit stations
  const pass1 = computeSafeFit(input.stationPoints, input.viewport, insets);

  // Measure union of placed card rects + headers + station points
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  if (input.placedCardRects) {
    for (const c of input.placedCardRects) {
      if (c.minX < minX) minX = c.minX;
      if (c.maxX > maxX) maxX = c.maxX;
      if (c.minY < minY) minY = c.minY;
      if (c.maxY > maxY) maxY = c.maxY;
    }
  }

  if (input.headerRects) {
    for (const h of input.headerRects) {
      if (h.minX < minX) minX = h.minX;
      if (h.maxX > maxX) maxX = h.maxX;
      if (h.minY < minY) minY = h.minY;
      if (h.maxY > maxY) maxY = h.maxY;
    }
  }

  for (const p of input.stationPoints) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  if (!isFinite(minX)) {
    minX = insets.left;
    maxX = input.viewport.width - insets.right;
    minY = insets.top;
    maxY = input.viewport.height - insets.bottom;
  }

  const unionBounds: ScreenRect = { minX, maxX, minY, maxY };

  // Pass 2: refit so union sits inside safe area with an 8% margin
  const safeW = pass1.safeBounds.width;
  const safeH = pass1.safeBounds.height;
  const marginX = safeW * marginPercent;
  const marginY = safeH * marginPercent;

  const marginInsets: SafeInsets = {
    left: insets.left + marginX,
    right: insets.right + marginX,
    top: insets.top + marginY,
    bottom: insets.bottom + marginY,
  };

  const unionPoints: Point2D[] = [
    { x: unionBounds.minX, y: unionBounds.minY },
    { x: unionBounds.maxX, y: unionBounds.minY },
    { x: unionBounds.minX, y: unionBounds.maxY },
    { x: unionBounds.maxX, y: unionBounds.maxY },
  ];

  const pass2 = computeSafeFit(unionPoints, input.viewport, marginInsets);

  const fitsInSafeArea =
    unionBounds.minX >= pass1.safeBounds.minX - 0.001 &&
    unionBounds.maxX <= pass1.safeBounds.maxX + 0.001 &&
    unionBounds.minY >= pass1.safeBounds.minY - 0.001 &&
    unionBounds.maxY <= pass1.safeBounds.maxY + 0.001;

  const fitsWithMargin = pass2.fits;

  return {
    pass1,
    pass2,
    unionBounds,
    effectiveDistanceMultiplier: pass1.distanceMultiplier * pass2.distanceMultiplier,
    fitsInSafeArea,
    fitsWithMargin,
  };
}
