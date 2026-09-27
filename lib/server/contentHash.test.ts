import { describe, expect, it } from "vitest";
import { canonicalJson, contentHash } from "./contentHash";

describe("canonicalJson", () => {
  it("sorts object keys at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("keeps array order, because order is meaningful in the contract", () => {
    expect(canonicalJson({ steps: ["b", "a"] })).toBe('{"steps":["b","a"]}');
    expect(canonicalJson(["b", "a"])).not.toBe(canonicalJson(["a", "b"]));
  });

  it("drops undefined so an absent optional field and a missing one agree", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("sorts by code point, not by locale", () => {
    // localeCompare would order these differently under some locales; code-point order must not vary.
    expect(canonicalJson({ Z: 1, a: 2, "ä": 3, A: 4 })).toBe('{"A":4,"Z":1,"a":2,"ä":3}');
  });
});

describe("contentHash", () => {
  it("is stable for the same document", () => {
    expect(contentHash({ a: 1 })).toBe(contentHash({ a: 1 }));
  });

  it("ignores key order but not values", () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash({ a: 1, b: 2 })).not.toBe(contentHash({ a: 1, b: 3 }));
  });

  it("is a 64-character lower-case hex digest with a known value", () => {
    const hash = contentHash({ schemaVersion: 3, moduleId: "ex-tax" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Pinned so a refactor of the canonical form cannot silently change every stored hash.
    expect(contentHash({})).toBe("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  });
});
