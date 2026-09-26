import { describe, it, expect } from "vitest";
import { searchTasks } from "./search";
import type { TaskSummary } from "./graphRepository";

const mockTasks: TaskSummary[] = [
  {
    taskId: "cloud-kitchen",
    title: "Register a Cloud Kitchen in Bandra",
    summary: "Complete guide for food delivery businesses and licenses.",
    category: "food_and_hospitality",
    city: "Mumbai",
    keywords: ["fssai", "food license", "takeaway"],
    stepCount: 10,
    verifiedStepCount: 8,
    synthetic: false,
  },
  {
    taskId: "liquor-license",
    title: "Bar and Restaurant Permit",
    summary: "Excise department clearance for serving alcohol and dining.",
    category: "food_and_hospitality",
    city: "Mumbai",
    keywords: ["bar", "excise", "kitchen"],
    stepCount: 12,
    verifiedStepCount: 10,
    synthetic: false,
  },
  {
    taskId: "trade-license",
    title: "General Municipal Trade License",
    summary: "Basic shop and commercial establishment registration in Mumbai.",
    category: "business_and_trade",
    city: "Mumbai",
    keywords: ["gumasta", "trade", "commercial"],
    stepCount: 5,
    verifiedStepCount: 5,
    synthetic: false,
  },
  {
    taskId: "property-assessment",
    title: "Property Tax Assessment",
    summary: "Municipal valuation and tax assessment procedures.",
    category: "property_and_tax",
    city: "Mumbai",
    keywords: ["property", "tax", "valuation"],
    stepCount: 4,
    verifiedStepCount: 4,
    synthetic: false,
  },
];

describe("searchTasks", () => {
  it("ranks title prefix (+3) above keyword (+2) above summary (+1)", () => {
    // "kitchen":
    // - "Register a Cloud Kitchen in Bandra" -> title word starts with kitchen (+3)
    // - "Bar and Restaurant Permit" -> keyword "kitchen" (+2)
    // - "General Municipal Trade License" -> no match
    const results = searchTasks(mockTasks, "kitchen");
    expect(results.map((r) => r.taskId)).toEqual([
      "cloud-kitchen",
      "liquor-license",
    ]);
  });

  it("handles multi-token queries and ignores short tokens (< 2 chars)", () => {
    const results = searchTasks(mockTasks, "a tax municipal");
    // "a" is ignored because length < 2.
    // "tax":
    //   - property-assessment: title word starts with "tax" (+3), keyword "tax" (+2), summary contains "tax" (+1) = 6
    //   - trade-license: summary has "commercial" not tax
    // "municipal":
    //   - trade-license: title word "municipal" (+3), summary "municipal" (+1) = 4
    //   - property-assessment: summary "municipal" (+1) = 1
    // Total for property-assessment: 6 + 1 = 7
    // Total for trade-license: 4
    expect(results.map((r) => r.taskId)).toEqual([
      "property-assessment",
      "trade-license",
    ]);
  });

  it("breaks ties using title ascending", () => {
    const tiedTasks: TaskSummary[] = [
      {
        ...mockTasks[0]!,
        taskId: "task-z",
        title: "Zebra Business Permit",
        summary: "Same query match here.",
        keywords: [],
      },
      {
        ...mockTasks[0]!,
        taskId: "task-a",
        title: "Apple Business Permit",
        summary: "Same query match here.",
        keywords: [],
      },
    ];

    const results = searchTasks(tiedTasks, "business");
    expect(results.map((r) => r.taskId)).toEqual(["task-a", "task-z"]);
  });

  it("respects limit parameter", () => {
    const results = searchTasks(mockTasks, "mumbai", 1);
    expect(results.length).toBe(1);
  });

  it("returns empty array for empty or unmatched query", () => {
    expect(searchTasks(mockTasks, "")).toEqual([]);
    expect(searchTasks(mockTasks, "x")).toEqual([]);
    expect(searchTasks(mockTasks, "nonexistentwordxyz")).toEqual([]);
  });
});
