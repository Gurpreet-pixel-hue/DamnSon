import { describe, it, expect } from "vitest";
import { computeSafeFit, computeTwoPassSafeFit } from "./computeSafeFit";

describe("computeSafeFit (F4 & H2)", () => {
  const insets = { left: 24, right: 24, top: 88, bottom: 110 };

  it("returns fits: true when all points are strictly within safe area at 1440x900", () => {
    const viewport = { width: 1440, height: 900 };
    const points = [
      { x: 100, y: 150 },
      { x: 720, y: 450 },
      { x: 1300, y: 700 },
    ];

    const result = computeSafeFit(points, viewport, insets);
    expect(result.fits).toBe(true);
    expect(result.scale).toBe(1.0);
    expect(result.distanceMultiplier).toBe(1.0);
    expect(result.pointsBounds.minX).toBe(100);
    expect(result.pointsBounds.maxX).toBe(1300);
    expect(result.pointsBounds.minY).toBe(150);
    expect(result.pointsBounds.maxY).toBe(700);
  });

  it("detects horizontal overflow and scales points into safe bounds at 1440x900", () => {
    const viewport = { width: 1440, height: 900 };
    // Safe area is [24, 1416] x [88, 790]
    const points = [
      { x: 10, y: 450 }, // overflows left (10 < 24)
      { x: 1430, y: 450 }, // overflows right (1430 > 1416)
    ];

    const result = computeSafeFit(points, viewport, insets);
    expect(result.fits).toBe(false);
    expect(result.scale).toBeLessThan(1.0);
    expect(result.distanceMultiplier).toBeGreaterThan(1.0);

    for (const pt of result.fittedPoints) {
      expect(pt.x).toBeGreaterThanOrEqual(result.safeBounds.minX - 0.001);
      expect(pt.x).toBeLessThanOrEqual(result.safeBounds.maxX + 0.001);
    }
  });

  it("detects vertical overflow and scales points into safe bounds at 1440x900", () => {
    const viewport = { width: 1440, height: 900 };
    const points = [
      { x: 720, y: 50 }, // overflows top (50 < 88)
      { x: 720, y: 850 }, // overflows bottom (850 > 790)
    ];

    const result = computeSafeFit(points, viewport, insets);
    expect(result.fits).toBe(false);
    expect(result.scale).toBeLessThan(1.0);

    for (const pt of result.fittedPoints) {
      expect(pt.y).toBeGreaterThanOrEqual(result.safeBounds.minY - 0.001);
      expect(pt.y).toBeLessThanOrEqual(result.safeBounds.maxY + 0.001);
    }
  });

  it("verifies safe fit bounds at 1280x800", () => {
    const viewport = { width: 1280, height: 800 };
    // Safe bounds at 1280x800: [24, 1256] x [88, 690]
    const points = [
      { x: 50, y: 120 },
      { x: 1200, y: 650 },
    ];

    const result = computeSafeFit(points, viewport, insets);
    expect(result.fits).toBe(true);
    expect(result.safeBounds.minX).toBe(24);
    expect(result.safeBounds.maxX).toBe(1256);
    expect(result.safeBounds.minY).toBe(88);
    expect(result.safeBounds.maxY).toBe(690);
  });

  it("handles empty points gracefully", () => {
    const viewport = { width: 1440, height: 900 };
    const result = computeSafeFit([], viewport, insets);
    expect(result.fits).toBe(true);
    expect(result.scale).toBe(1.0);
    expect(result.fittedPoints).toEqual([]);
  });

  it("the station bounding box spans at least 70 % of the safe-area width for the demo (G2)", () => {
    const viewport = { width: 1440, height: 900 };
    const demoPoints = [
      { x: 61, y: 616 },
      { x: 209, y: 590 },
      { x: 358, y: 598 },
      { x: 492, y: 542 },
      { x: 628, y: 551 },
      { x: 757, y: 528 },
      { x: 883, y: 507 },
      { x: 974, y: 437 },
      { x: 1008, y: 454 },
      { x: 1122, y: 465 },
      { x: 1244, y: 413 },
      { x: 1041, y: 505 },
      { x: 1348, y: 425 },
    ];
    const result = computeSafeFit(demoPoints, viewport, insets);
    expect(result.coverageWidth).toBeGreaterThanOrEqual(0.70);
  });

  it("it spans at least 60 % of the safe-area height for the stress graph (G2)", () => {
    const viewport = { width: 1440, height: 900 };
    const stressPoints = [
      { x: 191, y: 488 },
      { x: 196, y: 564 },
      { x: 212, y: 693 },
      { x: 218, y: 788 },
      { x: 376, y: 468 },
      { x: 382, y: 494 },
      { x: 403, y: 615 },
      { x: 419, y: 701 },
      { x: 431, y: 750 },
      { x: 556, y: 474 },
      { x: 578, y: 544 },
      { x: 602, y: 622 },
      { x: 627, y: 663 },
      { x: 768, y: 550 },
      { x: 886, y: 377 },
      { x: 920, y: 485 },
      { x: 960, y: 557 },
      { x: 1005, y: 636 },
      { x: 1043, y: 352 },
      { x: 1088, y: 414 },
      { x: 1180, y: 602 },
      { x: 1128, y: 526 },
      { x: 1211, y: 399 },
      { x: 1262, y: 463 },
      { x: 1330, y: 488 },
    ];
    const result = computeSafeFit(stressPoints, viewport, insets);
    expect(result.coverageHeight).toBeGreaterThanOrEqual(0.60);
  });

  it("computeTwoPassSafeFit refits union of placed cards and headers to safe area with 8% margin", () => {
    const viewport = { width: 1440, height: 900 };
    const stationPoints = [
      { x: 200, y: 300 },
      { x: 1200, y: 600 },
    ];
    const placedCardRects = [
      { minX: 24, maxX: 260, minY: 88, maxY: 136 },
      { minX: 1100, maxX: 1416, minY: 742, maxY: 790 },
    ];
    const headerRects = [
      { minX: 50, maxX: 190, minY: 88, maxY: 120 },
    ];

    const result = computeTwoPassSafeFit({
      stationPoints,
      placedCardRects,
      headerRects,
      viewport,
      insets,
    });

    expect(result.fitsInSafeArea).toBe(true);
    expect(result.unionBounds.minX).toBe(24);
    expect(result.unionBounds.maxX).toBe(1416);
    expect(result.unionBounds.minY).toBe(88);
    expect(result.unionBounds.maxY).toBe(790);
    expect(result.pass1.fits).toBe(true);
  });
});
