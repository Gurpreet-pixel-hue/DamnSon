import { describe, it, expect } from "vitest";
import { HEIGHTS, POLYGON_OFFSETS } from "./heights";

describe("Layer Heights and Z-Fight Prevention (§11.5)", () => {
  it("asserts height constants are strictly sorted and at least 0.01 apart", () => {
    const layers: Array<{ name: string; y: number }> = [
      { name: "landTop", y: HEIGHTS.landTop },
      { name: "roadSurface", y: HEIGHTS.roadSurface },
      { name: "routeLane", y: HEIGHTS.routeLane },
      { name: "plazaPadTop", y: HEIGHTS.plazaPadTop },
      { name: "ringsAndDecals", y: HEIGHTS.ringsAndDecals },
      { name: "pulses", y: HEIGHTS.pulses },
    ];

    for (let i = 1; i < layers.length; i++) {
      const prev = layers[i - 1]!;
      const curr = layers[i]!;
      expect(
        curr.y,
        `Layer ${curr.name} (${curr.y}) must be strictly higher than ${prev.name} (${prev.y})`
      ).toBeGreaterThan(prev.y);

      const diff = curr.y - prev.y;
      expect(
        diff,
        `Spacing between ${prev.name} and ${curr.name} must be >= 0.01 (measured ${diff.toFixed(3)})`
      ).toBeGreaterThanOrEqual(0.01 - 1e-6);
    }
  });

  it("verifies exact world Y heights specified in §11.5", () => {
    expect(HEIGHTS.landTop).toBe(0.170);
    expect(HEIGHTS.roadSurface).toBe(0.180);
    expect(HEIGHTS.routeLane).toBe(0.195);
    expect(HEIGHTS.plazaPadTop).toBe(0.210);
    expect(HEIGHTS.ringsAndDecals).toBe(0.225);
    expect(HEIGHTS.pulses).toBe(0.240);
  });

  it("verifies polygon offset factor and units decrease by 1 per layer above land", () => {
    expect(POLYGON_OFFSETS.land.factor).toBe(0);
    expect(POLYGON_OFFSETS.road.factor).toBe(-1);
    expect(POLYGON_OFFSETS.road.units).toBe(-1);

    expect(POLYGON_OFFSETS.routeLane.factor).toBe(-2);
    expect(POLYGON_OFFSETS.routeLane.units).toBe(-2);

    expect(POLYGON_OFFSETS.plazaPad.factor).toBe(-3);
    expect(POLYGON_OFFSETS.plazaPad.units).toBe(-3);

    expect(POLYGON_OFFSETS.ringsAndDecals.factor).toBe(-4);
    expect(POLYGON_OFFSETS.ringsAndDecals.units).toBe(-4);

    expect(POLYGON_OFFSETS.pulses.factor).toBe(-5);
    expect(POLYGON_OFFSETS.pulses.units).toBe(-5);
  });
});
