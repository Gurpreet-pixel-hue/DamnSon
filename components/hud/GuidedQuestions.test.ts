import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GuidedQuestions } from "./GuidedQuestions";
import type { ComposedJourney } from "@/lib/contract/compose";

function mockJourney(overrides: Partial<ComposedJourney> = {}): ComposedJourney {
  return {
    taskId: "test-task",
    revision: 1,
    title: "Test Task",
    summary: "Test Summary",
    jurisdiction: { country: "IN", state: "Maharashtra", city: "Mumbai" },
    category: "business_and_trade",
    facts: {},
    steps: [],
    edges: [],
    excluded: [],
    questions: [],
    ...overrides,
  };
}

describe("GuidedQuestions (E4)", () => {
  it("renders 'Same for everyone' when journey has no questions and no facts answered (water connection case)", () => {
    const journey = mockJourney({
      questions: [],
      facts: {},
    });

    const html = renderToStaticMarkup(
      React.createElement(GuidedQuestions, { journey, onAnswer: vi.fn() })
    );

    expect(html).toContain("Same for everyone");
    expect(html).toContain(
      "This procedure has no conditional questions. Every step applies to all applicants in this jurisdiction."
    );
  });

  it("renders 'Your map is fully personalised.' when questions are 0 but facts were answered", () => {
    const journey = mockJourney({
      questions: [],
      facts: { "business.serves_food": true },
    });

    const html = renderToStaticMarkup(
      React.createElement(GuidedQuestions, { journey, onAnswer: vi.fn() })
    );

    expect(html).toContain("Your map is fully personalised.");
  });

  it("renders pending question when questions exist", () => {
    const journey = mockJourney({
      questions: [
        {
          fact: "business.serves_food",
          text: "Will your establishment serve food or beverages?",
          answerType: "boolean",
          affectedStepCount: 3,
        },
      ],
      facts: {},
    });

    const html = renderToStaticMarkup(
      React.createElement(GuidedQuestions, { journey, onAnswer: vi.fn() })
    );

    expect(html).toContain("Will your establishment serve food or beverages?");
    expect(html).toContain("affects 3 stations");
  });
});
