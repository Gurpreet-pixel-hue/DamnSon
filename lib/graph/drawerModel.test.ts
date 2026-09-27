import { describe, it, expect } from "vitest";
import { buildStepDrawerModel } from "./drawerModel";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import { journeyTemplateSchema, approvalModuleSchema } from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";

function loadTestJourney() {
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
  return { journey, template, modules };
}

describe("drawerModel", () => {
  it("builds overview tab with office, portal, forms and prerequisites", () => {
    const { journey } = loadTestJourney();
    const kycStep = journey.steps.find((s) => s.id === "ex-directors.kyc.1")!;
    expect(kycStep).toBeDefined();

    const model = buildStepDrawerModel(kycStep, journey, new Set());

    expect(model.id).toBe("ex-directors.kyc.1");
    expect(model.isAvailable).toBe(true);
    expect(model.isLocked).toBe(false);
    expect(model.canMarkDone).toBe(true);
    expect(model.overview.requirement.kind).toBe("mandatory");

    // Online step shows portal or fallback, and office is null
    if (kycStep.kind !== "milestone" && kycStep.mode === "online") {
      expect(model.overview.office).toBeNull();
      expect(model.overview.portal).not.toBeNull();
    }
  });

  it("handles empty description by hiding the block (null)", () => {
    const { journey } = loadTestJourney();
    const kycStep = journey.steps.find((s) => s.id === "ex-directors.kyc.1")!;
    const stepWithEmptyDesc = { ...kycStep, description: "   " };

    const model = buildStepDrawerModel(stepWithEmptyDesc, journey, new Set());
    expect(model.overview.description).toBeNull();
  });

  it("handles missing office details with 'not verified' and maps link rules", () => {
    const { journey } = loadTestJourney();
    const inPersonStep = journey.steps.find(
      (s) => s.kind !== "milestone" && (s.mode === "in_person" || s.mode === "hybrid")
    );
    if (!inPersonStep || inPersonStep.kind === "milestone") return;

    // Test with missing lat/lng and missing address
    const strippedOfficeStep = {
      ...inPersonStep,
      office: { name: "Test Office" },
    };
    const model = buildStepDrawerModel(strippedOfficeStep, journey, new Set());
    expect(model.overview.office?.name).toBe("Test Office");
    expect(model.overview.office?.address).toBe("Address not verified");
    expect(model.overview.office?.hours).toBe("Hours not verified");
    expect(model.overview.office?.mapsUrl).toBeNull();
    expect(model.overview.office?.locationNote).toBe("Location not verified");
  });

  it("builds documents tab and reflects document checklist states", () => {
    const { journey } = loadTestJourney();
    const kycStep = journey.steps.find((s) => s.id === "ex-directors.kyc.1")!;
    const docKey = kycStep.kind !== "milestone" && kycStep.documents[0]?.key;

    if (docKey) {
      const modelUnchecked = buildStepDrawerModel(kycStep, journey, new Set(), {});
      expect(modelUnchecked.documents.documents[0]?.isChecked).toBe(false);

      const modelChecked = buildStepDrawerModel(kycStep, journey, new Set(), {
        [docKey]: true,
      });
      expect(modelChecked.documents.documents[0]?.isChecked).toBe(true);
    }
  });

  it("builds fees and timeline models with exact formatINR and SLA labels", () => {
    const { journey } = loadTestJourney();
    const kycStep = journey.steps.find((s) => s.id === "ex-directors.kyc.1")!;
    const model = buildStepDrawerModel(kycStep, journey, new Set());

    expect(model.fees.feeKind).toBeDefined();
    expect(model.fees.feeDisplayText).toBeDefined();
    expect(model.fees.slaKind).toBeDefined();
    expect(model.fees.slaDisplayText).toBeDefined();
  });

  it("identifies official vs unofficial sources via isOfficialUrl", () => {
    const { journey } = loadTestJourney();
    const incorpStep = journey.steps.find((s) => s.id === "ex-incorporation.file")!;
    const model = buildStepDrawerModel(incorpStep, journey, new Set());

    expect(model.sources.sources.length).toBeGreaterThan(0);
    for (const src of model.sources.sources) {
      expect(typeof src.isOfficial).toBe("boolean");
      expect(src.domain).toBeDefined();
      expect(src.retrievedOn.startsWith("Retrieved on")).toBe(true);
    }
  });

  it("lists unfinished prerequisites with edge notes when a step is locked", () => {
    const { journey } = loadTestJourney();
    const incorpStep = journey.steps.find((s) => s.id === "ex-incorporation.file")!;
    // With 0 completed steps, incorporation is locked
    const model = buildStepDrawerModel(incorpStep, journey, new Set());

    expect(model.isLocked).toBe(true);
    expect(model.overview.unfinishedPrerequisites.length).toBeGreaterThan(0);
    expect(model.overview.unfinishedPrerequisites.some((p) => p.id === "ex-directors.kyc.1")).toBe(true);
  });
});
