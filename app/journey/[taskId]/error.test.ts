import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JourneyError from "./error";

describe("JourneyError boundary component (A2)", () => {
  it("renders error message and retry action in static markup", () => {
    const error = new Error("Simulated repository failure: timeout");
    let resetCalled = false;
    const element = React.createElement(JourneyError, {
      error,
      reset: () => {
        resetCalled = true;
      },
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("Could not load this journey");
    expect(html).toContain("Simulated repository failure: timeout");
    expect(html).toContain("Retry");
    expect(html).toContain("Back to journeys");
    expect(resetCalled).toBe(false);
  });

  it("provides fallback text when error message is empty", () => {
    const error = new Error("");
    const element = React.createElement(JourneyError, {
      error,
      reset: () => {},
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("An unexpected error occurred while loading or parsing the journey data.");
  });

  it("renders with error digest if provided", () => {
    const error = Object.assign(new Error("Database connection lost"), { digest: "ERR_12345" });
    const element = React.createElement(JourneyError, {
      error,
      reset: vi.fn(),
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("Database connection lost");
    expect(html).toContain('data-testid="journey-error"');
  });
});
