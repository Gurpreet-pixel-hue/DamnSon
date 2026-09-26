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
  describe("1. Conformance: Ajv2020 and zod parity across all fixtures", () => {
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
      .filter((f) => f.endsWith(".json"));
    const invalidSchemaFiles = fs
      .readdirSync(invalidSchemaDir)
      .filter((f) => f.endsWith(".json"));
    const invalidGraphFiles = fs
      .readdirSync(invalidGraphDir)
      .filter((f) => f.endsWith(".json"));

    it("accepts all valid fixtures in both Ajv and zod", () => {
      for (const file of validFiles) {
        const data = loadFixture(`data/fixtures/valid/${file}`);
        const ajvOk = validateAjv(data);
        const zodResult = civicTaskGraphSchema.safeParse(data);

        expect(ajvOk).toBe(true);
        expect(zodResult.success).toBe(true);
      }
    });

    it("rejects all invalid-schema fixtures in both Ajv and zod", () => {
      for (const file of invalidSchemaFiles) {
        const data = loadFixture(`data/fixtures/invalid-schema/${file}`);
        const ajvOk = validateAjv(data);
        const zodResult = civicTaskGraphSchema.safeParse(data);

        expect(ajvOk).toBe(false);
        expect(zodResult.success).toBe(false);
      }
    });

    it("accepts all invalid-graph fixtures in both Ajv and zod (schema valid)", () => {
      for (const file of invalidGraphFiles) {
        const data = loadFixture(`data/fixtures/invalid-graph/${file}`);
        const ajvOk = validateAjv(data);
        const zodResult = civicTaskGraphSchema.safeParse(data);

        expect(ajvOk).toBe(true);
        expect(zodResult.success).toBe(true);
      }
    });
  });

  describe("2. The example graph analysis", () => {
    const example = loadFixture("data/fixtures/valid/example-graph.json");
    const parsed = civicTaskGraphSchema.parse(example);
    const analysis = analyzeGraph(parsed);

    it("is valid and returns ok = true", () => {
      expect(analysis.ok).toBe(true);
    });

    it("returns deterministic topological order", () => {
      expect(analysis.order).toEqual([
        "apply-online",
        "site-inspection",
        "fire-clearance",
        "licence-issued",
      ]);
    });

    it("computes correct parallel layers", () => {
      expect(analysis.layers).toEqual([
        ["apply-online"],
        ["site-inspection", "fire-clearance"],
        ["licence-issued"],
      ]);
    });

    it("includes NO_OFFICIAL_SOURCE for site-inspection and UNOFFICIAL_SOURCE for fire-clearance", () => {
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

  describe("3. Invalid graph fixtures integrity checks", () => {
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
  });

  describe("4. isOfficialUrl tests", () => {
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

    for (const [url, expected] of testCases) {
      it(`evaluates ${url} -> ${expected}`, () => {
        expect(isOfficialUrl(url)).toBe(expected);
      });
    }
  });
});
