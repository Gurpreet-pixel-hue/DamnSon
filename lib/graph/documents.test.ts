import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
} from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import { buildDocumentChecklist } from "./documents";

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

describe("documents derivation on ComposedJourney", () => {
  it("builds document checklist in exact first-appearance order with producers", () => {
    const { journey } = loadExampleStartupJourney();
    const checklist = buildDocumentChecklist(journey, new Set());

    expect(checklist).toEqual([
      {
        key: "pan-card-individual",
        label: "PAN card",
        usedIn: ["ex-directors.kyc.1", "ex-directors.kyc.2"],
        producedBy: [],
      },
      {
        key: "office-address-proof",
        label: "Registered office address proof",
        usedIn: ["ex-incorporation.file"],
        producedBy: [],
      },
      {
        key: "pan-card-individual#1",
        label: "PAN card (Founder 1)",
        usedIn: ["ex-incorporation.file"],
        producedBy: [],
      },
      {
        key: "pan-card-individual#2",
        label: "PAN card (Founder 2)",
        usedIn: ["ex-incorporation.file"],
        producedBy: [],
      },
      {
        key: "certificate-of-incorporation",
        label: "Certificate of Incorporation",
        usedIn: ["ex-banking.open-account"],
        producedBy: ["ex-incorporation.file"],
      },
    ]);
  });

  it("skips documents from completed steps", () => {
    const { journey } = loadExampleStartupJourney();
    const completed = new Set([
      "ex-directors.kyc.1",
      "ex-directors.kyc.2",
      "ex-incorporation.file",
    ]);
    const checklist = buildDocumentChecklist(journey, completed);

    // Only open-account remains needing certificate of incorporation
    expect(checklist).toEqual([
      {
        key: "certificate-of-incorporation",
        label: "Certificate of Incorporation",
        usedIn: ["ex-banking.open-account"],
        producedBy: ["ex-incorporation.file"],
      },
    ]);
  });
});
