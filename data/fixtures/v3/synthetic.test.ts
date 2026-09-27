import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "./loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
  OFFICE_TYPES,
} from "@/lib/contract/schema";
import { analyzeTemplate } from "@/lib/contract/analyze";
import { composeJourney } from "@/lib/contract/compose";
import { computeMetroLayout } from "@/lib/graph/layout";

describe("Synthetic v3 demo and stress templates", () => {
  it("demo-metro-synthetic passes analyzeTemplate", () => {
    const template = journeyTemplateSchema.parse(
      readTemplateFixture("demo-metro-synthetic")
    );
    const moduleNames = [
      "demo-identity",
      "demo-incorporation",
      "demo-premises",
      "demo-food",
      "demo-trade",
    ];
    const modules = moduleNames.map((name) =>
      approvalModuleSchema.parse(readModuleFixture(name))
    );

    const analysis = analyzeTemplate(template, modules);
    expect(analysis.ok).toBe(true);
    expect(
      analysis.issues.filter((i) => i.severity === "error")
    ).toHaveLength(0);
  });

  it("every answer combination of demo questions composes ok with unique positions", () => {
    const template = journeyTemplateSchema.parse(
      readTemplateFixture("demo-metro-synthetic")
    );
    const moduleNames = [
      "demo-identity",
      "demo-incorporation",
      "demo-premises",
      "demo-food",
      "demo-trade",
    ];
    const modules = moduleNames.map((name) =>
      approvalModuleSchema.parse(readModuleFixture(name))
    );

    const sectorOptions = ["it_saas", "food_service"] as const;
    const foundersOptions = [1, 2, 3] as const;

    for (const sector of sectorOptions) {
      for (const founders of foundersOptions) {
        const facts = {
          "business.sector": sector,
          "company.founders_count": founders,
        };

        const journey = composeJourney(template, modules, facts);
        expect(journey.steps.length).toBeGreaterThanOrEqual(12);
        expect(journey.steps.length).toBeLessThanOrEqual(14);

        const placements = computeMetroLayout(journey);
        expect(placements).toHaveLength(journey.steps.length);

        // Verify unique 3D positions
        const pos3DKeys = new Set<string>();
        for (const p of placements) {
          const key = p.position3D.join(",");
          expect(pos3DKeys.has(key)).toBe(false);
          pos3DKeys.add(key);
        }

        // Verify unique 2D positions
        const pos2DKeys = new Set<string>();
        for (const p of placements) {
          const key = `${p.position2D.x},${p.position2D.y}`;
          expect(pos2DKeys.has(key)).toBe(false);
          pos2DKeys.add(key);
        }
      }
    }
  });

  it("stress-25-synthetic passes analyzeTemplate and satisfies benchmark specs", () => {
    const template = journeyTemplateSchema.parse(
      readTemplateFixture("stress-25-synthetic")
    );
    const moduleNames = ["stress-alpha", "stress-beta"];
    const modules = moduleNames.map((name) =>
      approvalModuleSchema.parse(readModuleFixture(name))
    );

    const analysis = analyzeTemplate(template, modules);
    expect(analysis.ok).toBe(true);
    expect(
      analysis.issues.filter((i) => i.severity === "error")
    ).toHaveLength(0);

    const journey = composeJourney(template, modules, {});
    expect(journey.steps).toHaveLength(25);

    // 7 layers
    expect(analysis.layers).toHaveLength(7);

    // About 40 edges
    expect(journey.edges.length).toBeGreaterThanOrEqual(35);
    expect(journey.edges.length).toBeLessThanOrEqual(45);

    // 1 milestone
    const milestones = journey.steps.filter((s) => s.kind === "milestone");
    expect(milestones).toHaveLength(1);

    // All 12 office types
    const presentOfficeTypes = new Set(
      journey.steps
        .filter((s) => s.kind !== "milestone")
        .map((s) => s.officeType)
    );
    for (const officeType of OFFICE_TYPES) {
      expect(presentOfficeTypes.has(officeType)).toBe(true);
    }

    // Unique positions in layout
    const placements = computeMetroLayout(journey);
    expect(placements).toHaveLength(25);

    const posKeys = new Set(placements.map((p) => p.position3D.join(",")));
    expect(posKeys.size).toBe(25);
  });
});
