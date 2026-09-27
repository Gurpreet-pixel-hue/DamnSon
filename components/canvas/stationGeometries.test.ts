import { describe, it, expect, afterEach } from "vitest";
import {
  ARCHETYPE_KEYS,
  getStationGeometries,
  disposeStationGeometries,
} from "./stationGeometries";

describe("stationGeometries archetype bounding boxes", () => {
  afterEach(() => {
    disposeStationGeometries();
  });

  it("builds all 13 archetypes and verifies footprint <= 1.6x1.6 and height limits", () => {
    const geometries = getStationGeometries();
    expect(geometries.size).toBe(13);
    expect(ARCHETYPE_KEYS.length).toBe(13);

    for (const key of ARCHETYPE_KEYS) {
      const geom = geometries.get(key);
      expect(geom, `Geometry for ${key} must exist`).toBeDefined();

      geom!.computeBoundingBox();
      const box = geom!.boundingBox!;

      const width = box.max.x - box.min.x;
      const height = box.max.y - box.min.y;
      const depth = box.max.z - box.min.z;

      // Spec footprint <= 1.6 x 1.6 (with floating point tolerance 1e-4)
      expect(width, `${key} width ${width} must be <= 1.6`).toBeLessThanOrEqual(
        1.6 + 1e-4
      );
      expect(depth, `${key} depth ${depth} must be <= 1.6`).toBeLessThanOrEqual(
        1.6 + 1e-4
      );

      // Height: milestone <= 0.3, others <= 2.6
      if (key === "milestone") {
        expect(
          height,
          `milestone height ${height} must be <= 0.3`
        ).toBeLessThanOrEqual(0.3 + 1e-4);
      } else {
        expect(
          height,
          `${key} height ${height} must be <= 2.6`
        ).toBeLessThanOrEqual(2.6 + 1e-4);
        expect(
          height,
          `${key} height ${height} must be >= 0.3`
        ).toBeGreaterThanOrEqual(0.3);
      }

      // Check vertex attributes
      expect(geom!.getAttribute("position")).toBeDefined();
      expect(geom!.getAttribute("normal")).toBeDefined();
    }
  });
});
