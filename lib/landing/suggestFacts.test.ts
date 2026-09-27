import { describe, it, expect } from "vitest";
import { suggestFacts } from "./suggestFacts";

describe("suggestFacts (C2)", () => {
  it("suggests serves_food, sector=food_service and employees.count=5 for cloud kitchen query", () => {
    const query = "open a cloud kitchen in Andheri with 5 employees";
    const suggestions = suggestFacts(query);

    const factMap = new Map(suggestions.map((s) => [s.fact, s.value]));

    expect(factMap.get("business.serves_food")).toBe(true);
    expect(factMap.get("business.sector")).toBe("food_service");
    expect(factMap.get("employees.count")).toBe(5);
    expect(factMap.has("business.entity_type")).toBe(false);

    // Check evidence
    const foodSuggestion = suggestions.find((s) => s.fact === "business.serves_food");
    expect(foodSuggestion?.evidence.toLowerCase()).toBe("cloud kitchen");
  });

  it("suggests founders_count=2 and entity_type=private_limited for '2 founders pvt ltd'", () => {
    const query = "2 founders pvt ltd";
    const suggestions = suggestFacts(query);

    const factMap = new Map(suggestions.map((s) => [s.fact, s.value]));
    expect(factMap.get("company.founders_count")).toBe(2);
    expect(factMap.get("business.entity_type")).toBe("private_limited");
  });

  it("suggests sector=retail for 'shop' and nothing for serves_food", () => {
    const query = "open a new shop in Pune";
    const suggestions = suggestFacts(query);

    const factMap = new Map(suggestions.map((s) => [s.fact, s.value]));
    expect(factMap.get("business.sector")).toBe("retail");
    expect(factMap.has("business.serves_food")).toBe(false);
  });

  it("respects allowedFacts filter when specified", () => {
    const query = "cloud kitchen with 5 employees";
    // Template only allows business.serves_food
    const suggestions = suggestFacts(query, ["business.serves_food"]);

    expect(suggestions.length).toBe(1);
    expect(suggestions[0]?.fact).toBe("business.serves_food");
    expect(suggestions[0]?.value).toBe(true);
  });

  it("handles word boundaries and avoids substrings inside unrelated words", () => {
    const query = "looking for a bishop and a workshop";
    const suggestions = suggestFacts(query);
    // "shop" should not match inside "bishop" or "workshop" because of \b
    const factMap = new Map(suggestions.map((s) => [s.fact, s.value]));
    expect(factMap.has("business.sector")).toBe(false);
  });

  it("handles empty or whitespace query gracefully", () => {
    expect(suggestFacts("")).toEqual([]);
    expect(suggestFacts("   ")).toEqual([]);
  });
});
