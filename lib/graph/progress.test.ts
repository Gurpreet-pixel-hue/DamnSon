import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { deriveStepStates, nextUpStepIds } from "./progress";
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

describe("progress", () => {
  it("derives step states with no steps completed", () => {
    const graph = loadExample();
    const states = deriveStepStates(graph, new Set());

    expect(states.get("apply-online")).toBe("available");
    expect(states.get("site-inspection")).toBe("locked");
    expect(states.get("fire-clearance")).toBe("locked");
    expect(states.get("licence-issued")).toBe("locked");

    const nextUp = nextUpStepIds(graph, states);
    expect(nextUp).toEqual(["apply-online"]);
  });

  it("derives step states with apply-online completed", () => {
    const graph = loadExample();
    const states = deriveStepStates(graph, new Set(["apply-online"]));

    expect(states.get("apply-online")).toBe("done");
    expect(states.get("site-inspection")).toBe("available");
    expect(states.get("fire-clearance")).toBe("available");
    expect(states.get("licence-issued")).toBe("locked");

    const nextUp = nextUpStepIds(graph, states);
    expect(nextUp).toEqual(["site-inspection", "fire-clearance"]);
  });

  it("ignores unknown step ids in completed set", () => {
    const graph = loadExample();
    const states = deriveStepStates(
      graph,
      new Set(["ghost-step", "apply-online"])
    );

    expect(states.get("apply-online")).toBe("done");
    expect(states.get("site-inspection")).toBe("available");
    expect(states.has("ghost-step")).toBe(false);
  });
});
