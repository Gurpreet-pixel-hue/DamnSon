import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
} from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import { computeMetroLayout } from "./layout";

function loadExampleStartupJourney() {
  const template = journeyTemplateSchema.parse(
    readTemplateFixture("example-startup")
  );
  const moduleNames = [
    "ex-directors",
    "ex-incorporation",
    "ex-banking",
    "ex-tax",
    "ex-food",
    "ex-recognition",
    "ex-local",
  ];
  const modules = moduleNames.map((name) =>
    approvalModuleSchema.parse(readModuleFixture(name))
  );
  const facts = {
    "business.sector": "it_saas",
    "company.founders_count": 2,
    "employees.count": 5,
  };
  const journey = composeJourney(template, modules, facts);
  return { journey };
}

describe("layout derivation on ComposedJourney", () => {
  it("computes exact 3D and 2D coordinates for all steps per Phase 2 specifications", () => {
    const { journey } = loadExampleStartupJourney();
    const placements = computeMetroLayout(journey);

    const placementMap = new Map(placements.map((p) => [p.stepId, p]));

    expect(placementMap.get("ex-directors.kyc.1")).toMatchObject({
      layer: 0,
      lane: -0.5,
      position3D: [0, 2.2, -2.25],
      position2D: { x: 0, y: -70 },
    });

    expect(placementMap.get("ex-directors.kyc.2")).toMatchObject({
      layer: 0,
      lane: 0.5,
      position3D: [0, 2.2, 2.25],
      position2D: { x: 0, y: 70 },
    });

    expect(placementMap.get("ex-incorporation.file")).toMatchObject({
      layer: 1,
      lane: 0,
      position3D: [7, 2.2, 0],
      position2D: { x: 280, y: 0 },
    });

    expect(placementMap.get("ex-incorporation.incorporated")).toMatchObject({
      layer: 2,
      lane: 0,
      position3D: [14, 0, 0],
      position2D: { x: 560, y: 0 },
    });

    expect(placementMap.get("ex-banking.open-account")).toMatchObject({
      layer: 3,
      lane: -1,
      position3D: [21, 0, -4.5],
      position2D: { x: 840, y: -140 },
    });

    expect(placementMap.get("ex-food.apply")).toMatchObject({
      layer: 3,
      lane: 0,
      position3D: [21, 2.2, 0],
      position2D: { x: 840, y: 0 },
    });

    expect(placementMap.get("ex-local.intimation")).toMatchObject({
      layer: 3,
      lane: 1,
      position3D: [21, 2.2, 4.5],
      position2D: { x: 840, y: 140 },
    });

    expect(placementMap.get("ex-recognition.apply")).toMatchObject({
      layer: 4,
      lane: -0.5,
      position3D: [28, 2.2, -2.25],
      position2D: { x: 1120, y: -70 },
    });

    expect(placementMap.get("ex-local.display")).toMatchObject({
      layer: 4,
      lane: 0.5,
      position3D: [28, 0, 2.25],
      position2D: { x: 1120, y: 70 },
    });
  });
});
