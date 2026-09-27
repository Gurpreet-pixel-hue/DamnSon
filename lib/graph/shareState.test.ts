import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
} from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import {
  encodeShareState,
  decodeShareState,
  sanitizeShareState,
  type ShareState,
} from "./shareState";

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
  return { journey, facts };
}

describe("shareState on contract v3", () => {
  it("encodes share state exactly per Phase 2 specification", () => {
    const { facts } = loadExampleStartupJourney();
    const state: ShareState = {
      taskId: "example-startup",
      facts,
      completed: ["ex-incorporation.file", "ex-directors.kyc.1"],
    };

    const encoded = encodeShareState(state);
    expect(encoded).toBe(
      "task=example-startup&f=eyJidXNpbmVzcy5zZWN0b3IiOiJpdF9zYWFzIiwiY29tcGFueS5mb3VuZGVyc19jb3VudCI6MiwiZW1wbG95ZWVzLmNvdW50Ijo1fQ&done=ex-directors.kyc.1%2Cex-incorporation.file"
    );
  });

  it("decodes valid share state and round-trips cleanly", () => {
    const { facts } = loadExampleStartupJourney();
    const original: ShareState = {
      taskId: "example-startup",
      facts,
      completed: ["ex-directors.kyc.1", "ex-incorporation.file"],
    };

    const query = new URLSearchParams(encodeShareState(original));
    const decoded = decodeShareState(query);

    expect(decoded).toEqual(original);
  });

  it("drops malformed params gracefully on decode", () => {
    const params = new URLSearchParams("task=valid-task&f=invalid-base64&done=bad!id,valid-id");
    const decoded = decodeShareState(params);

    expect(decoded).toEqual({
      taskId: "valid-task",
      facts: {},
      completed: ["valid-id"],
    });

    const noTask = new URLSearchParams("f=test");
    expect(decodeShareState(noTask)).toBeNull();
  });

  it("sanitizes share state by dropping ghost steps and milestone steps per C1", () => {
    const { journey, facts } = loadExampleStartupJourney();
    const rawState: ShareState = {
      taskId: "example-startup",
      facts: {
        ...facts,
        // @ts-expect-error test unknown fact key removal
        "unknown.fact": "junk",
      },
      completed: [
        "ex-directors.kyc.1",
        "ghost.step",
        "ex-incorporation.incorporated", // Milestone step (should be dropped per C1)
        "ex-incorporation.file",
      ],
    };

    const sanitized = sanitizeShareState(rawState, journey);

    expect(sanitized.facts).toEqual(facts);
    expect(sanitized.completed).toEqual([
      "ex-directors.kyc.1",
      "ex-incorporation.file",
    ]);
  });
});
