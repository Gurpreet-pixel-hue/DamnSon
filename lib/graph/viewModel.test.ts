import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
} from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import { fromJourney } from "./viewModel";

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

describe("viewModel fromJourney", () => {
  it("converts ComposedJourney into MetroVM with correct station and track properties", () => {
    const { journey } = loadExampleStartupJourney();
    const completed = new Set<string>();

    const metro = fromJourney(journey, completed);

    expect(metro.stations.length).toBe(9);
    expect(metro.tracks.length).toBeGreaterThan(0);

    const stationMap = new Map(metro.stations.map((s) => [s.id, s]));

    // Check station properties
    const kyc1 = stationMap.get("ex-directors.kyc.1");
    expect(kyc1).toMatchObject({
      kind: "government",
      officeType: "online_portal",
      mode: "online",
      state: "available",
      applicability: "applies",
      position3D: [0, 2.2, -2.25],
      position2D: { x: 0, y: -70 },
    });

    const milestone = stationMap.get("ex-incorporation.incorporated");
    expect(milestone).toMatchObject({
      kind: "milestone",
      officeType: null,
      mode: null,
      state: "locked",
      applicability: "applies",
      position3D: [14, 0, 0],
      position2D: { x: 560, y: 0 },
    });

    const food = stationMap.get("ex-food.apply");
    expect(food).toMatchObject({
      applicability: "may_apply",
      state: "locked",
    });

    const rec = stationMap.get("ex-recognition.apply");
    expect(rec).toMatchObject({
      applicability: "optional",
      state: "locked",
    });

    // Check critical path track flag:
    // Critical path: [ex-directors.kyc.1, ex-incorporation.file, ex-incorporation.incorporated, ex-food.apply]
    const kycToFile = metro.tracks.find(
      (t) => t.from === "ex-directors.kyc.1" && t.to === "ex-incorporation.file"
    );
    expect(kycToFile?.critical).toBe(true);

    const kyc2ToFile = metro.tracks.find(
      (t) => t.from === "ex-directors.kyc.2" && t.to === "ex-incorporation.file"
    );
    expect(kyc2ToFile?.critical).toBe(false);

    // Track to may_apply or optional step is dashed
    const incToFood = metro.tracks.find(
      (t) => t.from === "ex-incorporation.incorporated" && t.to === "ex-food.apply"
    );
    expect(incToFood?.dashed).toBe(true);
    expect(incToFood?.critical).toBe(true);

    // Recommended after track is dashed
    const bankToRec = metro.tracks.find(
      (t) => t.from === "ex-banking.open-account" && t.to === "ex-recognition.apply"
    );
    expect(bankToRec?.kind).toBe("recommended_after");
    expect(bankToRec?.dashed).toBe(true);
  });
});
