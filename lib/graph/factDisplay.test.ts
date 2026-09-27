import { describe, it, expect } from "vitest";
import { formatFactValue } from "./factDisplay";
import type { Question } from "@/lib/contract/schema";

describe("lib/graph/factDisplay", () => {
  it("uses the matching question option label when present", () => {
    const question: Question = {
      fact: "business.sector",
      text: "What is your industry sector?",
      options: [
        { label: "IT & Software Services", value: "it_saas" },
        { label: "Retail & E-commerce", value: "retail" },
      ],
    };

    expect(formatFactValue("business.sector", "it_saas", question)).toBe(
      "IT & Software Services"
    );
    expect(formatFactValue("business.sector", "retail", question)).toBe(
      "Retail & E-commerce"
    );
  });

  it("formats booleans as Yes/No", () => {
    expect(formatFactValue("business.serves_food", true)).toBe("Yes");
    expect(formatFactValue("business.serves_food", false)).toBe("No");
  });

  it("formats numbers using Indian number formatting (en-IN)", () => {
    expect(formatFactValue("company.founders_count", 2)).toBe("2");
    expect(formatFactValue("employees.count", 1000000)).toBe("10,00,000");
  });

  it("falls back to turning underscores into spaces for enums/strings with no question", () => {
    expect(formatFactValue("business.sector", "it_saas")).toBe("it saas");
    expect(formatFactValue("business.entity_type", "private_limited")).toBe(
      "private limited"
    );
  });

  it("returns 'Not specified' for undefined or null values", () => {
    expect(formatFactValue("business.sector", undefined)).toBe("Not specified");
  });
});
