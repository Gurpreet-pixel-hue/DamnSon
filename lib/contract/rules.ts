import { FACTS, isValidFactValue, type FactKey, type Facts, type FactValue } from "./facts";
import type { Condition, Rule } from "./schema";

export type TriState = "true" | "false" | "unknown";

function isCondition(rule: Rule): rule is Condition {
  return "fact" in rule;
}

function compare(op: Condition["op"], actual: FactValue, expected: Condition["value"]): boolean {
  switch (op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "exists":
      return true;
  }
}

/**
 * Kleene three-valued evaluation. A missing (or invalid) fact makes a condition "unknown",
 * except `exists`, which is "false" when the fact is missing.
 * all: false if any false, else unknown if any unknown, else true.
 * any: true if any true, else unknown if any unknown, else false.
 * not: swaps true/false, keeps unknown.
 */
export function evaluateRule(rule: Rule, facts: Facts): TriState {
  if ("all" in rule) {
    const r = rule.all.map((x) => evaluateRule(x, facts));
    return r.includes("false") ? "false" : r.includes("unknown") ? "unknown" : "true";
  }
  if ("any" in rule) {
    const r = rule.any.map((x) => evaluateRule(x, facts));
    return r.includes("true") ? "true" : r.includes("unknown") ? "unknown" : "false";
  }
  if ("not" in rule) {
    const r = evaluateRule(rule.not, facts);
    return r === "unknown" ? "unknown" : r === "true" ? "false" : "true";
  }
  const actual = facts[rule.fact];
  const known = actual !== undefined && isValidFactValue(rule.fact, actual);
  if (rule.op === "exists") return known ? "true" : "false";
  if (!known) return "unknown";
  return compare(rule.op, actual, rule.value) ? "true" : "false";
}

/** Every fact key a rule reads, in first-seen order, without duplicates. */
export function ruleFacts(rule: Rule): FactKey[] {
  const out: FactKey[] = [];
  const visit = (r: Rule): void => {
    if ("all" in r) r.all.forEach(visit);
    else if ("any" in r) r.any.forEach(visit);
    else if ("not" in r) visit(r.not);
    else if (!out.includes(r.fact)) out.push(r.fact);
  };
  visit(rule);
  return out;
}

/** All leaf conditions of a rule (for type checks and source checks). */
export function ruleConditions(rule: Rule): Condition[] {
  if ("all" in rule) return rule.all.flatMap(ruleConditions);
  if ("any" in rule) return rule.any.flatMap(ruleConditions);
  if ("not" in rule) return ruleConditions(rule.not);
  return isCondition(rule) ? [rule] : [];
}

export type RuleProblem = "RULE_TYPE_MISMATCH" | "THRESHOLD_WITHOUT_SOURCE";

/** Static checks for one condition against the fact registry. */
export function checkCondition(c: Condition): RuleProblem[] {
  const def = FACTS[c.fact];
  const problems: RuleProblem[] = [];
  const scalarOk = (v: unknown): boolean => isValidFactValue(c.fact, v);
  switch (c.op) {
    case "exists":
      if (c.value !== undefined) problems.push("RULE_TYPE_MISMATCH");
      break;
    case "eq":
    case "neq":
      if (Array.isArray(c.value) || !scalarOk(c.value)) problems.push("RULE_TYPE_MISMATCH");
      break;
    case "in":
      if (!Array.isArray(c.value) || !c.value.every(scalarOk)) problems.push("RULE_TYPE_MISMATCH");
      break;
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      if ((def.type !== "integer" && def.type !== "number") || typeof c.value !== "number") {
        problems.push("RULE_TYPE_MISMATCH");
      }
      if (c.sourceRef === undefined) problems.push("THRESHOLD_WITHOUT_SOURCE");
      break;
  }
  return problems;
}
