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

export function computeSafeFit(
  points2D: Point2D[],
  viewport: Viewport,
  insets: SafeInsets
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
