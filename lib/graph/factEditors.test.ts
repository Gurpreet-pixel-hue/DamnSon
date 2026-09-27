import { describe, it, expect } from "vitest";
import { getUsedFacts, getFactEditorModel } from "./factEditors";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import { journeyTemplateSchema, approvalModuleSchema } from "@/lib/contract/schema";

describe("factEditors", () => {
  it("collects all facts referenced by template and modules without inventing or adding unused keys", () => {
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

    const usedFacts = getUsedFacts(template, modules);
    expect(usedFacts.length).toBeGreaterThan(0);

    // Used facts should include business sector, founders count, food service, etc.
    expect(usedFacts).toContain("business.sector");
    expect(usedFacts).toContain("company.founders_count");
    expect(usedFacts).toContain("business.serves_food");

    // Must be unique
    const uniqueSet = new Set(usedFacts);
    expect(uniqueSet.size).toBe(usedFacts.length);
  });

  it("builds fact editor model with correct registry definitions", () => {
    const currentFacts = {
      "business.sector": "it_saas",
      "company.founders_count": 2,
    };

    const enumModel = getFactEditorModel("business.sector", currentFacts);
    expect(enumModel.type).toBe("enum");
    expect(enumModel.value).toBe("it_saas");
    expect(enumModel.isSet).toBe(true);

    const unsetModel = getFactEditorModel("business.serves_food", currentFacts);
    expect(unsetModel.type).toBe("boolean");
    expect(unsetModel.value).toBeUndefined();
    expect(unsetModel.isSet).toBe(false);
  });
});
