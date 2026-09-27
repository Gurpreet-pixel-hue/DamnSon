import { FACTS, type FactKey, type FactValue } from "@/lib/contract/facts";
import type { Question } from "@/lib/contract/schema";

/** Human text for a fact value, using the template question's option label when there is one. */
export function formatFactValue(fact: FactKey, value: FactValue, question?: Question): string {
  const option = question?.options?.find((o) => o.value === value);
  if (option) return option.label;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString("en-IN");
  return FACTS[fact].type === "enum" ? value.replace(/_/g, " ") : value;
}
