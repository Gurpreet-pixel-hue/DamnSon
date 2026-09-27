/**
 * suggestFacts: Suggested answers from your words (§9.3, approved by Gurpreet).
 * Pure helper that scans query against a curated keyword table.
 * Used when mode is lexical_fallback, or when AI returned no facts.
 */

import {
  type FactKey,
  type FactValue,
  isValidFactValue,
} from "@/lib/contract/facts";

export interface SuggestedFact {
  fact: FactKey;
  value: FactValue;
  evidence: string;
}

interface KeywordRule {
  pattern: RegExp;
  extract: (match: RegExpExecArray) => Array<{ fact: FactKey; value: FactValue }>;
}

const RULES: KeywordRule[] = [
  // Entity type
  {
    pattern: /\b(?:private\s+limited|pvt\.?\s*ltd\.?)\b/i,
    extract: () => [{ fact: "business.entity_type", value: "private_limited" }],
  },
  {
    pattern: /\b(?:one\s+person\s+company|opc)\b/i,
    extract: () => [{ fact: "business.entity_type", value: "opc" }],
  },
  {
    pattern: /\bllp\b/i,
    extract: () => [{ fact: "business.entity_type", value: "llp" }],
  },

  // Food service & sector
  {
    pattern: /\b(?:restaurant|cloud\s+kitchen|caf[eé]|food|bakery|catering|dhaba|tiffin)\b/i,
    extract: () => [
      { fact: "business.serves_food", value: true },
      { fact: "business.sector", value: "food_service" },
    ],
  },

  // Other sectors
  {
    pattern: /\b(?:saas|software|app|it\s+company|tech\s+startup)\b/i,
    extract: () => [{ fact: "business.sector", value: "it_saas" }],
  },
  {
    pattern: /\b(?:shop|store|retail)\b/i,
    extract: () => [{ fact: "business.sector", value: "retail" }],
  },
  {
    pattern: /\b(?:factory|manufactur\w*)\b/i,
    extract: () => [{ fact: "business.sector", value: "manufacturing" }],
  },

  // Numerical counts
  {
    pattern: /\b(\d+)\s*(?:employees|staff|people|workers)\b/i,
    extract: (m) => [{ fact: "employees.count", value: parseInt(m[1]!, 10) }],
  },
  {
    pattern: /\b(\d+)\s*(?:founders|directors|partners|co-founders)\b/i,
    extract: (m) => [{ fact: "company.founders_count", value: parseInt(m[1]!, 10) }],
  },

  // Intents
  {
    pattern: /\b(?:trademark|brand\s+name)\b/i,
    extract: () => [{ fact: "intent.trademark", value: true }],
  },
  {
    pattern: /\bgst\b/i,
    extract: () => [{ fact: "intent.gst_now", value: true }],
  },
  {
    pattern: /\b(?:udyam|msme)\b/i,
    extract: () => [{ fact: "intent.udyam", value: true }],
  },
  {
    pattern: /\b(?:dpiit|startup\s+india|startup\s+recognition)\b/i,
    extract: () => [{ fact: "intent.dpiit", value: true }],
  },
  {
    pattern: /\b(?:export|import)\b/i,
    extract: () => [{ fact: "business.imports_or_exports", value: true }],
  },
];

/**
 * Scans a user query against the curated keyword table and extracts suggested facts.
 *
 * @param query The natural-language query string
 * @param allowedFacts Optional set or array of fact keys allowed by the template
 */
export function suggestFacts(
  query: string,
  allowedFacts?: readonly string[] | Set<string>
): SuggestedFact[] {
  if (!query || !query.trim()) return [];

  const allowedSet = allowedFacts
    ? allowedFacts instanceof Set
      ? allowedFacts
      : new Set(allowedFacts)
    : null;

  const results: SuggestedFact[] = [];
  const seenFacts = new Set<string>();

  for (const rule of RULES) {
    const match = rule.pattern.exec(query);
    if (!match) continue;

    const evidence = match[0];
    const items = rule.extract(match);

    for (const item of items) {
      if (seenFacts.has(item.fact)) continue;
      if (allowedSet && !allowedSet.has(item.fact)) continue;

      if (isValidFactValue(item.fact, item.value)) {
        seenFacts.add(item.fact);
        results.push({
          fact: item.fact,
          value: item.value,
          evidence,
        });
      }
    }
  }

  return results;
}
