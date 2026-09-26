import { describe, expect, it } from "vitest";
import { parseFacts, type Facts } from "./facts";
import { evaluateRule, type TriState } from "./rules";
import type { Rule } from "./schema";

// PRD App. D.7 §3: three-valued logic. An unknown fact never silently excludes a step (§8.4).
const FOOD: Rule = {
  any: [
    { fact: "business.sector", op: "eq", value: "food_service" },
    { fact: "business.serves_food", op: "eq", value: true },
  ],
};
const BOTH_INTENTS: Rule = {
  all: [
    { fact: "intent.dpiit", op: "eq", value: true },
    { fact: "intent.udyam", op: "eq", value: true },
  ],
};
const NOT_DPIIT: Rule = { not: { fact: "intent.dpiit", op: "eq", value: true } };
const COUNT_EXISTS: Rule = { fact: "employees.count", op: "exists" };
const COUNT_GTE_20: Rule = { fact: "employees.count", op: "gte", value: 20 };
const PREMISES_IN: Rule = { fact: "premises.type", op: "in", value: ["rented", "coworking"] };

const CASES: readonly (readonly [string, Rule, Facts, TriState])[] = [
  ["any(...) with only a non-matching sector", FOOD, { "business.sector": "it_saas" }, "unknown"],
  ["any(...) with every branch false", FOOD, { "business.sector": "it_saas", "business.serves_food": false }, "false"],
  ["any(...) with one branch true", FOOD, { "business.sector": "food_service" }, "true"],
  ["all(...) with one true and one missing", BOTH_INTENTS, { "intent.dpiit": true }, "unknown"],
  ["all(...) with one false", BOTH_INTENTS, { "intent.dpiit": false }, "false"],
  ["not(unknown)", NOT_DPIIT, {}, "unknown"],
  ["exists on a missing fact", COUNT_EXISTS, {}, "false"],
  ["gte below the threshold", COUNT_GTE_20, { "employees.count": 5 }, "false"],
  ["in with a matching value", PREMISES_IN, { "premises.type": "coworking" }, "true"],
  ["gte after an invalid value is dropped", COUNT_GTE_20, parseFacts({ "employees.count": "five" }), "unknown"],
];

describe("evaluateRule (App. D.7 §3)", () => {
  for (const [name, rule, facts, expected] of CASES) {
    it(`${name} → ${expected}`, () => {
      expect(evaluateRule(rule, facts)).toBe(expected);
    });
  }
});
