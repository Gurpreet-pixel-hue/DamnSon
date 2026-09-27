import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
} from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import { planOfficeTrips } from "./trips";

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

describe("trips derivation on ComposedJourney", () => {
  it("groups non-online, non-optional action steps by office/department in order", () => {
    const { journey } = loadExampleStartupJourney();
    const trips = planOfficeTrips(journey);

    expect(trips).toEqual([
      {
        key: "any scheduled bank",
        name: "Any scheduled bank",
        officeType: "other",
        stepIds: ["ex-banking.open-account"],
        mayApply: false,
      },
      {
        key: "example state department",
        name: "Example State Department",
        officeType: "other",
        stepIds: ["ex-local.display"],
        mayApply: false,
      },
    ]);
  });
});
