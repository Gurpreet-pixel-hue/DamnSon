import { describe, it, expect } from "vitest";
import { computeSafeFit } from "./computeSafeFit";

describe("computeSafeFit (F4)", () => {
  const insets = { left: 24, right: 24, top: 110, bottom: 120 };

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
    // Safe area is [24, 1416] x [110, 780]
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
      { x: 720, y: 50 }, // overflows top (50 < 110)
      { x: 720, y: 850 }, // overflows bottom (850 > 780)
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
    // Safe bounds at 1280x800: [24, 1256] x [110, 680]
    const points = [
      { x: 50, y: 120 },
      { x: 1200, y: 650 },
    ];

    const result = computeSafeFit(points, viewport, insets);
    expect(result.fits).toBe(true);
    expect(result.safeBounds.minX).toBe(24);
    expect(result.safeBounds.maxX).toBe(1256);
    expect(result.safeBounds.minY).toBe(110);
    expect(result.safeBounds.maxY).toBe(680);
  });

  it("handles empty points gracefully", () => {
    const viewport = { width: 1440, height: 900 };
    const result = computeSafeFit([], viewport, insets);
    expect(result.fits).toBe(true);
    expect(result.scale).toBe(1.0);
    expect(result.fittedPoints).toEqual([]);
  });
});
