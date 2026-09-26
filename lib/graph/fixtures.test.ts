import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { civicTaskGraphSchema, type CivicTaskGraph } from "./schema";
import { analyzeGraph } from "./analyzeGraph";
import { resolvePath, type Answers } from "./resolvePath";
import { computeMetroLayout } from "./layout";

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

const jsonSchemaPath = path.resolve(
  process.cwd(),
  "docs/graph-data-schema.json"
);
const jsonSchema = JSON.parse(fs.readFileSync(jsonSchemaPath, "utf8"));
const validateAjv = ajv.compile(jsonSchema);

function loadFixture(relPath: string): CivicTaskGraph {
  const fullPath = path.resolve(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

describe("synthetic demo and stress fixtures", () => {
  const demoPath = "data/fixtures/demo/demo-metro.json";
  const stressPath = "data/fixtures/stress/stress-25.json";

  it("demo-metro.json passes Ajv, zod and analyzeGraph", () => {
    const raw = loadFixture(demoPath);
    expect(validateAjv(raw)).toBe(true);
    const parsed = civicTaskGraphSchema.parse(raw);
    const analysis = analyzeGraph(parsed);
    expect(analysis.ok).toBe(true);
    expect(analysis.layers.length).toBeGreaterThanOrEqual(5);
    const has3Parallel = analysis.layers.some((l) => l.length >= 3);
    expect(has3Parallel).toBe(true);
  });

  it("stress-25.json passes Ajv, zod and analyzeGraph", () => {
    const raw = loadFixture(stressPath);
    expect(validateAjv(raw)).toBe(true);
    const parsed = civicTaskGraphSchema.parse(raw);
    const analysis = analyzeGraph(parsed);
    expect(analysis.ok).toBe(true);
    expect(analysis.order.length).toBe(25);
    expect(parsed.edges.length).toBe(40);
    expect(analysis.layers.length).toBeGreaterThanOrEqual(6);
  });

  it("for all 8 answer combinations of demo, resolved graph is ok and placements have unique position3D", () => {
    const raw = loadFixture(demoPath);
    const graph = civicTaskGraphSchema.parse(raw);

    const questions = graph.questions.map((q) => q.id);
    expect(questions.length).toBe(3);

    const combinations: Answers[] = [];
    for (const b0 of [false, true]) {
      for (const b1 of [false, true]) {
        for (const b2 of [false, true]) {
          const q0 = questions[0];
          const q1 = questions[1];
          const q2 = questions[2];
          if (q0 && q1 && q2) {
            combinations.push({
              [q0]: b0,
              [q1]: b1,
              [q2]: b2,
            });
          }
        }
      }
    }

    expect(combinations.length).toBe(8);

    for (const answers of combinations) {
      const resolved = resolvePath(graph, answers);
      const analysis = analyzeGraph(resolved.graph);
      expect(analysis.ok).toBe(true);

      const placements = computeMetroLayout(resolved);
      const pos3DStrings = placements.map(
        (p) => `${p.position3D[0]},${p.position3D[1]},${p.position3D[2]}`
      );
      const uniquePos = new Set(pos3DStrings);
      expect(uniquePos.size).toBe(placements.length);
    }
  });

  it("stress layout has 25 placements with unique positions", () => {
    const raw = loadFixture(stressPath);
    const graph = civicTaskGraphSchema.parse(raw);
    const resolved = resolvePath(graph, {});
    const placements = computeMetroLayout(resolved);

    expect(placements.length).toBe(25);
    const pos3DStrings = placements.map(
      (p) => `${p.position3D[0]},${p.position3D[1]},${p.position3D[2]}`
    );
    const unique3D = new Set(pos3DStrings);
    expect(unique3D.size).toBe(25);

    const pos2DStrings = placements.map((p) => `${p.position2D.x},${p.position2D.y}`);
    const unique2D = new Set(pos2DStrings);
    expect(unique2D.size).toBe(25);
  });
});
