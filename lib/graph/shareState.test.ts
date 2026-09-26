import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  encodeShareState,
  decodeShareState,
  sanitizeShareState,
  type ShareState,
} from "./shareState";
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

describe("shareState", () => {
  it("encodes share state matching exact expectation", () => {
    const state: ShareState = {
      taskId: "example-diamond",
      answers: { "large-premises": false },
      completed: ["site-inspection", "apply-online"],
    };

    const encoded = encodeShareState(state);
    expect(encoded).toBe(
      "task=example-diamond&a=large-premises.n&done=apply-online%2Csite-inspection"
    );
  });

  it("round-trips encode and decode", () => {
    const state: ShareState = {
      taskId: "example-diamond",
      answers: { "large-premises": false },
      completed: ["apply-online", "site-inspection"],
    };

    const encoded = encodeShareState(state);
    const decoded = decodeShareState(new URLSearchParams(encoded));

    expect(decoded).toEqual(state);
  });

  it("returns null on missing or invalid task parameter", () => {
    expect(decodeShareState(new URLSearchParams(""))).toBeNull();
    expect(
      decodeShareState(new URLSearchParams("task=INVALID_CAPS"))
    ).toBeNull();
  });

  it("sanitizes share state by dropping ghost question and step ids", () => {
    const graph = loadExample();
    const unsanitized: ShareState = {
      taskId: "example-diamond",
      answers: {
        "large-premises": true,
        "ghost-question": false,
      },
      completed: ["apply-online", "ghost-step"],
    };

    const sanitized = sanitizeShareState(unsanitized, graph);
    expect(sanitized).toEqual({
      taskId: "example-diamond",
      answers: {
        "large-premises": true,
      },
      completed: ["apply-online"],
    });
  });
});
