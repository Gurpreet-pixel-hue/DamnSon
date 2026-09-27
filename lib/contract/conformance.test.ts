import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ValidateFunction } from "ajv";
import { describe, expect, it } from "vitest";
import {
  del,
  readJsonRecord,
  readModuleFixture,
  readTemplateFixture,
  set,
  type JsonRecord,
} from "@/data/fixtures/v3/loadFixture";
import { approvalModuleSchema, journeyTemplateSchema } from "./schema";

// PRD App. D.7 §1: every fixture is valid under zod AND under the generated JSON Schemas (Ajv 2020, strict),
// and every mutation below is invalid under BOTH. Fixtures are loaded by file name, never globbed (PL-1),
// so new synthetic templates added in FE-2 cannot change these expectations.
const MODULES = ["ex-banking", "ex-directors", "ex-food", "ex-incorporation", "ex-local", "ex-recognition", "ex-tax"] as const;
const TEMPLATES = ["example-startup"] as const;

const root = process.cwd();

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validators: Record<"module" | "template", ValidateFunction> = {
  module: ajv.compile(readJsonRecord(join(root, "docs", "contract", "approval-module.schema.json"))),
  template: ajv.compile(readJsonRecord(join(root, "docs", "contract", "journey-template.schema.json"))),
};
const zodValid = (kind: "module" | "template", doc: unknown): boolean =>
  (kind === "module" ? approvalModuleSchema : journeyTemplateSchema).safeParse(doc).success;

describe("conformance: fixtures are valid in zod and Ajv (App. D.7 §1)", () => {
  for (const name of MODULES) {
    it(`modules/${name}.json`, () => {
      const doc = readModuleFixture(name);
      expect(zodValid("module", doc)).toBe(true);
      expect(validators.module(doc)).toBe(true);
    });
  }
  for (const name of TEMPLATES) {
    it(`templates/${name}.json`, () => {
      const doc = readTemplateFixture(name);
      expect(zodValid("template", doc)).toBe(true);
      expect(validators.template(doc)).toBe(true);
    });
  }
});

interface Mutation {
  name: string;
  kind: "module" | "template";
  fixture: string;
  apply: (doc: JsonRecord) => void;
}

const MUTATIONS: readonly Mutation[] = [
  { name: "stored status", kind: "module", fixture: "ex-food", apply: (d) => set(d, ["steps", 0], "status", "locked") },
  { name: "stored total", kind: "module", fixture: "ex-tax", apply: (d) => set(d, [], "totalEstimatedFees", 3200) },
  { name: "http source", kind: "module", fixture: "ex-food", apply: (d) => set(d, ["sources", 0], "url", "http://www.india.gov.in/") },
  { name: "fee without source", kind: "module", fixture: "ex-tax", apply: (d) => del(d, ["steps", 0, "fee"], "sourceRef") },
  { name: "SLA without source", kind: "module", fixture: "ex-tax", apply: (d) => del(d, ["steps", 0, "timeline", "officialSla"], "sourceRef") },
  { name: "milestone with a fee", kind: "module", fixture: "ex-incorporation", apply: (d) => set(d, ["steps", 1], "fee", { kind: "unknown" }) },
  { name: "government step without authority", kind: "module", fixture: "ex-tax", apply: (d) => del(d, ["steps", 0], "authoritySlug") },
  { name: "unknown fact", kind: "module", fixture: "ex-local", apply: (d) => set(d, ["steps", 0, "requirement", "rule"], "fact", "employees.headcount") },
  { name: "verified without date", kind: "module", fixture: "ex-directors", apply: (d) => del(d, ["steps", 0, "review"], "verifiedOn") },
  { name: "flagged without note", kind: "module", fixture: "ex-food", apply: (d) => del(d, ["steps", 0, "review"], "note") },
  { name: "bad id", kind: "module", fixture: "ex-tax", apply: (d) => set(d, ["steps", 0], "id", "Register Employer") },
  { name: "conditional duration without kind", kind: "module", fixture: "ex-food", apply: (d) => del(d, ["steps", 0, "timeline", "conditional", 0, "duration"], "kind") },
  { name: "old version", kind: "module", fixture: "ex-tax", apply: (d) => set(d, [], "schemaVersion", 2) },
];

describe("conformance: mutations are rejected by zod and Ajv (App. D.7 §1)", () => {
  for (const mutation of MUTATIONS) {
    it(`${mutation.name} (${mutation.fixture})`, () => {
      const doc = mutation.kind === "module" ? readModuleFixture(mutation.fixture) : readTemplateFixture(mutation.fixture);
      mutation.apply(doc);
      expect(zodValid(mutation.kind, doc)).toBe(false);
      expect(validators[mutation.kind](doc)).toBe(false);
    });
  }

  // Known, accepted difference (App. D.7 §1): zod's refinement catches a duplicate keyword; JSON Schema cannot.
  it("duplicate template keyword: zod rejects, Ajv accepts", () => {
    const doc = readTemplateFixture("example-startup");
    set(doc, ["keywords"], 1, "example");
    expect(zodValid("template", doc)).toBe(false);
    expect(validators.template(doc)).toBe(true);
  });
});
