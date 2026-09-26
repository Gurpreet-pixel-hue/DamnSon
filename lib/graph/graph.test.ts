import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { civicTaskGraphSchema } from "./schema";
import { analyzeGraph, type GraphIssueCode } from "./analyzeGraph";
import { isOfficialUrl } from "./officialSources";

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

const jsonSchemaPath = path.resolve(process.cwd(), "docs/graph-data-schema.json");
const jsonSchema = JSON.parse(fs.readFileSync(jsonSchemaPath, "utf8"));
const validateAjv = ajv.compile(jsonSchema);

function loadFixture(relPath: string) {
  const fullPath = path.resolve(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

describe("Graph contract & analyzer test suite", () => {
  describe("1. Conformance: Ajv2020 and zod parity across all fixture files (24 tests)", () => {
    const validDir = path.resolve(process.cwd(), "data/fixtures/valid");
    const invalidSchemaDir = path.resolve(
      process.cwd(),
      "data/fixtures/invalid-schema"
    );
    const invalidGraphDir = path.resolve(
      process.cwd(),
      "data/fixtures/invalid-graph"
    );

    const validFiles = fs
      .readdirSync(validDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    const invalidSchemaFiles = fs
      .readdirSync(invalidSchemaDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    const invalidGraphFiles = fs
      .readdirSync(invalidGraphDir)
      .filter((f) => f.endsWith(".json"))
      .sort();

    it.each(validFiles)("valid fixture conforms to schema: %s", (file) => {
      const data = loadFixture(`data/fixtures/valid/${file}`);
      expect(validateAjv(data)).toBe(true);
      expect(civicTaskGraphSchema.safeParse(data).success).toBe(true);
    });

    it.each(invalidSchemaFiles)(
      "invalid-schema fixture is rejected by both: %s",
      (file) => {
        const data = loadFixture(`data/fixtures/invalid-schema/${file}`);
        expect(validateAjv(data)).toBe(false);
        expect(civicTaskGraphSchema.safeParse(data).success).toBe(false);
      }
    );

    it.each(invalidGraphFiles)(
      "invalid-graph fixture is schema-valid in both: %s",
      (file) => {
        const data = loadFixture(`data/fixtures/invalid-graph/${file}`);
        expect(validateAjv(data)).toBe(true);
        expect(civicTaskGraphSchema.safeParse(data).success).toBe(true);
      }
    );
  });

  describe("2. The example graph analysis (1 test)", () => {
    it("analyzes example graph correctly (ok, order, layers, warnings)", () => {
      const example = loadFixture("data/fixtures/valid/example-graph.json");
      const parsed = civicTaskGraphSchema.parse(example);
      const analysis = analyzeGraph(parsed);

      expect(analysis.ok).toBe(true);
      expect(analysis.order).toEqual([
        "apply-online",
        "site-inspection",
        "fire-clearance",
        "licence-issued",
      ]);
      expect(analysis.layers).toEqual([
        ["apply-online"],
        ["site-inspection", "fire-clearance"],
        ["licence-issued"],
      ]);

      const siteInspectionWarning = analysis.issues.find(
        (issue) =>
          issue.code === "NO_OFFICIAL_SOURCE" &&
          issue.nodeIds?.includes("site-inspection")
      );
      expect(siteInspectionWarning).toBeDefined();

      const fireClearanceWarning = analysis.issues.find(
        (issue) =>
          issue.code === "UNOFFICIAL_SOURCE" &&
          issue.nodeIds?.includes("fire-clearance")
      );
      expect(fireClearanceWarning).toBeDefined();
    });
  });

  describe("3. Invalid graph fixtures integrity checks (12 tests) and warnings", () => {
    const expectations: Record<string, GraphIssueCode> = {
      "cycle.json": "CYCLE",
      "unknown-ref.json": "UNKNOWN_NODE_REF",
      "duplicate-node-id.json": "DUPLICATE_NODE_ID",
      "duplicate-edge-id.json": "DUPLICATE_EDGE_ID",
      "self-loop.json": "SELF_LOOP",
      "duplicate-edge.json": "DUPLICATE_EDGE",
      "fee-range-inverted.json": "INVERTED_RANGE",
      "duration-range-inverted.json": "INVERTED_RANGE",
      "verified-without-official-source.json":
        "VERIFIED_WITHOUT_OFFICIAL_SOURCE",
      "unknown-question-ref.json": "UNKNOWN_QUESTION_REF",
      "duplicate-question-id.json": "DUPLICATE_QUESTION_ID",
      "optional-prerequisite.json": "OPTIONAL_PREREQUISITE",
    };

    for (const [filename, expectedCode] of Object.entries(expectations)) {
      it(`detects ${expectedCode} in ${filename}`, () => {
        const fixture = loadFixture(`data/fixtures/invalid-graph/${filename}`);
        const parsed = civicTaskGraphSchema.parse(fixture);
        const analysis = analyzeGraph(parsed);

        expect(analysis.ok).toBe(false);
        expect(analysis.order).toEqual([]);
        expect(analysis.layers).toEqual([]);
        const hasExpectedCode = analysis.issues.some(
          (issue) => issue.code === expectedCode && issue.severity === "error"
        );
        expect(hasExpectedCode).toBe(true);
      });
    }

    it("detects UNUSED_QUESTION warning when a question is unreferenced", () => {
      const example = loadFixture("data/fixtures/valid/example-graph.json");
      const cloned = JSON.parse(JSON.stringify(example));
      cloned.questions.push({
        id: "unused-extra-question",
        text: "Is this question unreferenced?",
      });
      const parsed = civicTaskGraphSchema.parse(cloned);
      const analysis = analyzeGraph(parsed);
      expect(analysis.ok).toBe(true);
      const unusedWarning = analysis.issues.find(
        (issue) =>
          issue.code === "UNUSED_QUESTION" && issue.severity === "warning"
      );
      expect(unusedWarning).toBeDefined();
    });
  });

  describe("4. isOfficialUrl tests (8 tests)", () => {
    const testCases: Array<[string, boolean]> = [
      ["https://portal.mcgm.gov.in/", true],
      ["https://foscos.fssai.gov.in/", true],
      ["https://example.nic.in/x", true],
      ["http://portal.mcgm.gov.in/", false],
      ["https://gov.in.evil.com/", false],
      ["https://evilgov.in/", false],
      ["https://example.com/", false],
      ["not a url", false],
    ];

    it.each(testCases)("evaluates %s -> %s", (url, expected) => {
      expect(isOfficialUrl(url)).toBe(expected);
    });
  });
});
