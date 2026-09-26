import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { planOfficeTrips } from "./trips";
import { resolvePath } from "./resolvePath";
import { civicTaskGraphSchema, type CivicTaskGraph } from "./schema";

function loadExample(): CivicTaskGraph {
  const filePath = path.resolve(
    process.cwd(),
    "data/fixtures/valid/example-graph.json"
  );
  return civicTaskGraphSchema.parse(
    JSON.parse(fs.readFileSync(filePath, "utf8"))
  );
}

describe("planOfficeTrips", () => {
  it("plans office trips for {} matching exact expectations", () => {
    const graph = loadExample();
    const resolved = resolvePath(graph, {});
    const trips = planOfficeTrips(resolved);

    expect(trips.map((t) => [t.name, t.stepIds])).toEqual([
      ["Example Ward Office", ["site-inspection"]],
      ["Example Fire Services", ["fire-clearance"]],
    ]);

    expect(trips[0]?.lat).toBe(19.0596);
    expect(trips[0]?.lng).toBe(72.8295);
    expect(trips[0]?.officeType).toBe("ward_office");
  });

  it('plans office trips for {"large-premises": false} matching exact expectations', () => {
    const graph = loadExample();
    const resolved = resolvePath(graph, { "large-premises": false });
    const trips = planOfficeTrips(resolved);

    expect(trips.map((t) => t.name)).toEqual(["Example Ward Office"]);
  });
});
