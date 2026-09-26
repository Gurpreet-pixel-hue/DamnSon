import { z } from "zod";

/** Fact keys are the only personalisation inputs. Adding a key or an enum value is a Class B change (PR + ADR). */
export const FACT_KEYS = [
  "location.state",
  "location.city",
  "business.entity_type",
  "business.sector",
  "business.serves_food",
  "business.imports_or_exports",
  "company.founders_count",
  "employees.count",
  "premises.type",
  "premises.built_up_area_sqm",
  "intent.gst_now",
  "intent.udyam",
  "intent.dpiit",
  "intent.trademark",
  "applicant.type",
] as const;
export type FactKey = (typeof FACT_KEYS)[number];
export type FactValue = string | number | boolean;
export type Facts = Partial<Record<FactKey, FactValue>>;

export type FactDef =
  | { type: "boolean"; label: string }
  | { type: "enum"; label: string; values: readonly string[] }
  | { type: "integer"; label: string; min: number; max: number }
  | { type: "number"; label: string; min: number; max: number }
  | { type: "string"; label: string; maxLength: number };

export const FACTS: { readonly [K in FactKey]: FactDef } = {
  "location.state": { type: "string", label: "State", maxLength: 60 },
  "location.city": { type: "string", label: "City", maxLength: 60 },
  "business.entity_type": {
    type: "enum",
    label: "Business entity",
    values: ["private_limited", "llp", "opc", "partnership", "proprietorship"],
  },
  "business.sector": {
    type: "enum",
    label: "Business sector",
    values: ["it_saas", "food_service", "retail", "manufacturing", "services", "other"],
  },
  "business.serves_food": { type: "boolean", label: "Makes, serves or sells food" },
  "business.imports_or_exports": { type: "boolean", label: "Imports or exports goods or services" },
  "company.founders_count": { type: "integer", label: "Founders / directors", min: 1, max: 10 },
  "employees.count": { type: "integer", label: "Employees", min: 0, max: 100000 },
  "premises.type": { type: "enum", label: "Premises", values: ["rented", "owned", "home", "coworking"] },
  "premises.built_up_area_sqm": { type: "number", label: "Built-up area (sq m)", min: 0, max: 1000000 },
  "intent.gst_now": { type: "boolean", label: "Register for GST now" },
  "intent.udyam": { type: "boolean", label: "Wants Udyam (MSME) registration" },
  "intent.dpiit": { type: "boolean", label: "Wants DPIIT startup recognition" },
  "intent.trademark": { type: "boolean", label: "Wants to register a trademark" },
  "applicant.type": {
    type: "enum",
    label: "Applicant",
    values: ["owner", "tenant", "legal_heir", "buyer", "company"],
  },
};

export const factKeySchema = z.enum(FACT_KEYS);
export const factValueSchema = z.union([z.string().max(120), z.number(), z.boolean()]);

/** True when `value` has the registry type of `key` and is inside its range / enum. */
export function isValidFactValue(key: FactKey, value: unknown): value is FactValue {
  const def = FACTS[key];
  switch (def.type) {
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return typeof value === "string" && def.values.includes(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value) && value >= def.min && value <= def.max;
    case "number":
      return typeof value === "number" && Number.isFinite(value) && value >= def.min && value <= def.max;
    case "string":
      return typeof value === "string" && value.trim().length > 0 && value.length <= def.maxLength;
  }
}

function isFactKey(key: string): key is FactKey {
  return (FACT_KEYS as readonly string[]).includes(key);
}

/**
 * Lenient parser for untrusted facts (URL, localStorage, LLM output):
 * unknown keys and invalid values are dropped, never thrown.
 */
export function parseFacts(input: unknown): Facts {
  const record = z.record(z.string(), z.unknown()).safeParse(input);
  if (!record.success) return {};
  const out: Facts = {};
  for (const [key, value] of Object.entries(record.data)) {
    if (isFactKey(key) && isValidFactValue(key, value)) out[key] = value;
  }
  return out;
}
