import type { FactKey, FactValue } from "@/lib/contract/facts";
import type { Question } from "@/lib/contract/schema";

/**
 * Formats a fact value for human display according to FE-4 rules:
 * 1. If the template question for this fact has options, use the label of the option whose value matches.
 * 2. Otherwise booleans show "Yes"/"No" and numbers use toLocaleString("en-IN").
 * 3. Only then, enums show their value with underscores turned into spaces.
 */
export function formatFactValue(
  fact: FactKey,
  value: FactValue | undefined,
  question?: Question | null
): string {
  if (value === undefined || value === null) {
    return "Not specified";
  }

  // 1. If the template question for this fact has options, use matching option label
  if (question?.options && question.options.length > 0) {
    const matchingOpt = question.options.find((opt: { value: FactValue; label: string }) => opt.value === value);
    if (matchingOpt?.label) {
      return matchingOpt.label;
    }
  }

  // 2. Otherwise booleans show Yes/No and numbers use toLocaleString("en-IN")
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return value.toLocaleString("en-IN");
  }

  // 3. Only then, enums show their value with underscores turned into spaces
  if (typeof value === "string") {
    return value.replace(/_/g, " ");
  }

  return String(value);
}
