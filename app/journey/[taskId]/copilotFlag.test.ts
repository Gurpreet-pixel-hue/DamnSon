import { describe, expect, it } from "vitest";
import { isCopilotEnabled } from "./copilotFlag";

describe("isCopilotEnabled", () => {
  it("is off when the service URL is unset, empty or blank", () => {
    expect(isCopilotEnabled(undefined)).toBe(false);
    expect(isCopilotEnabled("")).toBe(false);
    expect(isCopilotEnabled("   ")).toBe(false);
  });

  it("is off for a value that is not an http(s) URL", () => {
    expect(isCopilotEnabled("not a url")).toBe(false);
    expect(isCopilotEnabled("ftp://example.org")).toBe(false);
  });

  it("is on for an http(s) service URL", () => {
    expect(isCopilotEnabled("http://localhost:8000")).toBe(true);
    expect(isCopilotEnabled(" https://civicweave-ai.example.org ")).toBe(true);
  });
});
