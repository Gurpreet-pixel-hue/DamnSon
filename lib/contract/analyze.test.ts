import { describe, expect, it } from "vitest";
import { del, push, readModuleFixture, readTemplateFixture, set, type JsonRecord } from "@/data/fixtures/v3/loadFixture";
import { analyzeModule, analyzeTemplate, type GraphAnalysis, type IssueCode } from "./analyze";
import { approvalModuleSchema, journeyTemplateSchema, type ApprovalModule, type JourneyTemplate } from "./schema";

// PRD App. D.7 §2: every case below is SCHEMA-VALID, so only the analyzer can catch it (§8.7).
const MODULE_NAMES = ["ex-banking", "ex-directors", "ex-food", "ex-incorporation", "ex-local", "ex-recognition", "ex-tax"] as const;

function parseModule(doc: unknown): ApprovalModule {
  const parsed = approvalModuleSchema.safeParse(doc);
  if (!parsed.success) throw new Error(`expected schema-valid input: ${JSON.stringify(parsed.error.issues)}`);
  return parsed.data;
}
function parseTemplate(doc: unknown): JourneyTemplate {
  const parsed = journeyTemplateSchema.safeParse(doc);
  if (!parsed.success) throw new Error(`expected schema-valid input: ${JSON.stringify(parsed.error.issues)}`);
  return parsed.data;
}
const codesOf = (analysis: GraphAnalysis, severity: "error" | "warning"): IssueCode[] =>
  analysis.issues.filter((i) => i.severity === severity).map((i) => i.code);

const allModules = (): ApprovalModule[] => MODULE_NAMES.map((name) => parseModule(readModuleFixture(name)));

describe("analyzeModule: clean fixtures (App. D.7)", () => {
  for (const name of MODULE_NAMES) {
    it(`${name} has no errors`, () => {
      const analysis = analyzeModule(parseModule(readModuleFixture(name)));
      expect(codesOf(analysis, "error")).toEqual([]);
      expect(analysis.ok).toBe(true);
    });
  }
});

interface ModuleCase {
  name: string;
  fixture: (typeof MODULE_NAMES)[number];
  mutate: (doc: JsonRecord) => void;
  expected: IssueCode;
}

const MODULE_CASES: readonly ModuleCase[] = [
  {
    name: "edge display → intimation closes a loop",
    fixture: "ex-local",
    mutate: (d) => push(d, ["edges"], { id: "e-cycle", from: "display", to: "intimation", kind: "requires" }),
    expected: "CYCLE",
  },
  {
    name: "step cites a source id the module doesn't define",
    fixture: "ex-tax",
    mutate: (d) => set(d, ["steps", 0], "sourceIds", ["ghost"]),
    expected: "UNKNOWN_SOURCE_REF",
  },
  {
    name: "verified step cites only an unofficial source",
    fixture: "ex-directors",
    mutate: (d) => set(d, ["sources", 0], "url", "https://example.com/x"),
    expected: "VERIFIED_WITHOUT_OFFICIAL_SOURCE",
  },
  {
    name: "numeric threshold without a sourceRef",
    fixture: "ex-local",
    mutate: (d) => del(d, ["steps", 0, "requirement", "rule"], "sourceRef"),
    expected: "THRESHOLD_WITHOUT_SOURCE",
  },
  {
    name: "rule compares an integer fact with a string",
    fixture: "ex-local",
    mutate: (d) => set(d, ["steps", 0, "requirement", "rule"], "value", "ten"),
    expected: "RULE_TYPE_MISMATCH",
  },
  {
    name: "fee range with min above max",
    fixture: "ex-incorporation",
    mutate: (d) => set(d, ["steps", 0, "fee"], "minINR", 2000),
    expected: "INVERTED_RANGE",
  },
  {
    name: "optional step is a requires-prerequisite of another step",
    fixture: "ex-local",
    mutate: (d) => set(d, ["steps", 0], "requirement", { kind: "optional" }),
    expected: "OPTIONAL_PREREQUISITE",
  },
  {
    name: "repeat over a fact that isn't an integer",
    fixture: "ex-directors",
    mutate: (d) => set(d, ["steps", 0, "repeat"], "fact", "intent.dpiit"),
    expected: "REPEAT_FACT_NOT_INTEGER",
  },
];

describe("analyzeModule: errors on schema-valid input (App. D.7 §2)", () => {
  for (const testCase of MODULE_CASES) {
    it(`${testCase.fixture}: ${testCase.name} → ${testCase.expected}`, () => {
      const doc = readModuleFixture(testCase.fixture);
      testCase.mutate(doc);
      const analysis = analyzeModule(parseModule(doc));
      expect(codesOf(analysis, "error")).toContain(testCase.expected);
      expect(analysis.ok).toBe(false);
      expect(analysis.order).toEqual([]);
      expect(analysis.layers).toEqual([]);
    });
  }
});

interface TemplateCase {
  name: string;
  mutate: (doc: JsonRecord) => void;
  expected: IssueCode;
}

const TEMPLATE_CASES: readonly TemplateCase[] = [
  {
    name: "a link back from ex-local to ex-directors",
    mutate: (d) => push(d, ["links"], { id: "l-cycle", fromModule: "ex-local", toModule: "ex-directors", kind: "requires" }),
    expected: "CYCLE",
  },
  {
    name: "a module with an activation rule marked mandatory",
    mutate: (d) => set(d, ["modules", 3], "requirement", "mandatory"),
    expected: "MODULE_REQUIREMENT_MISMATCH",
  },
  {
    name: "a module pinned to a version that isn't supplied",
    mutate: (d) => set(d, ["modules", 0], "version", 2),
    expected: "UNKNOWN_MODULE",
  },
];

describe("analyzeTemplate (App. D.7 §2)", () => {
  it("the unmodified template passes with one UNOFFICIAL_SOURCE warning on ex-incorporation", () => {
    const analysis = analyzeTemplate(parseTemplate(readTemplateFixture("example-startup")), allModules());
    expect(codesOf(analysis, "error")).toEqual([]);
    expect(analysis.ok).toBe(true);
    expect(codesOf(analysis, "warning")).toEqual(["UNOFFICIAL_SOURCE"]);
    expect(analysis.issues[0]?.moduleId).toBe("ex-incorporation");
  });

  it("orders the maximal composition deterministically", () => {
    const analysis = analyzeTemplate(parseTemplate(readTemplateFixture("example-startup")), allModules());
    expect(analysis.order).toEqual([
      "ex-directors.kyc.1",
      "ex-incorporation.file",
      "ex-incorporation.incorporated",
      "ex-banking.open-account",
      "ex-tax.register",
      "ex-food.apply",
      "ex-recognition.apply",
      "ex-local.intimation",
      "ex-local.registration",
      "ex-local.display",
    ]);
  });

  for (const testCase of TEMPLATE_CASES) {
    it(`${testCase.name} → ${testCase.expected}`, () => {
      const doc = readTemplateFixture("example-startup");
      testCase.mutate(doc);
      const analysis = analyzeTemplate(parseTemplate(doc), allModules());
      expect(codesOf(analysis, "error")).toContain(testCase.expected);
      expect(analysis.ok).toBe(false);
    });
  }
});
