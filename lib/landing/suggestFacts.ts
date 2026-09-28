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
    pattern: /(?<![\p{L}\p{N}])(?:private\s+limited|pvt\.?\s*ltd\.?)(?![\p{L}\p{N}])/iu,
    extract: () => [{ fact: "business.entity_type", value: "private_limited" }],
  },
  {
    pattern: /(?<![\p{L}\p{N}])(?:one\s+person\s+company|opc)(?![\p{L}\p{N}])/iu,
    extract: () => [{ fact: "business.entity_type", value: "opc" }],
  },
  {
    pattern: /(?<![\p{L}\p{N}])llp(?![\p{L}\p{N}])/iu,
    extract: () => [{ fact: "business.entity_type", value: "llp" }],
  },

  // Food service & sector
  {
    pattern: /(?<![\p{L}\p{N}])(?:restaurant|cloud\s+kitchen|caf[eé]|food|bakery|catering|dhaba|tiffin)(?![\p{L}\p{N}])/iu,
    extract: () => [
      { fact: "business.serves_food", value: true },
      { fact: "business.sector", value: "food_service" },
    ],
  },

  // Other sectors
  {
    pattern: /(?<![\p{L}\p{N}])(?:saas|software|app|it\s+company|tech\s+startup)(?![\p{L}\p{N}])/iu,
    extract: () => [{ fact: "business.sector", value: "it_saas" }],
  },
  {
    pattern: /(?<![\p{L}\p{N}])(?:shop|store|retail)(?![\p{L}\p{N}])/iu,
    extract: () => [{ fact: "business.sector", value: "retail" }],
  },
  {
    pattern: /(?<![\p{L}\p{N}])(?:factory|manufactur\w*)(?![\p{L}\p{N}])/iu,
    extract: () => [{ fact: "business.sector", value: "manufacturing" }],
  },

  // Numerical counts
  {
    pattern: /(?<![\p{L}\p{N}])(\d+)\s*(?:employees|staff|people|workers)(?![\p{L}\p{N}])/iu,
    extract: (m) => [{ fact: "employees.count", value: parseInt(m[1]!, 10) }],
  },
  {
    pattern: /(?<![\p{L}\p{N}])(\d+)\s*(?:founders|directors|partners|co-founders)(?![\p{L}\p{N}])/iu,
    extract: (m) => [{ fact: "company.founders_count", value: parseInt(m[1]!, 10) }],
  },

  // Intents
  {
    pattern: /(?<![\p{L}\p{N}])(?:trademark|brand\s+name)(?![\p{L}\p{N}])/iu,
    extract: () => [{ fact: "intent.trademark", value: true }],
  },
  {
    pattern: /(?<![\p{L}\p{N}])gst(?![\p{L}\p{N}])/iu,
    extract: () => [{ fact: "intent.gst_now", value: true }],
  },
  {
    pattern: /(?<![\p{L}\p{N}])(?:udyam|msme)(?![\p{L}\p{N}])/iu,
    extract: () => [{ fact: "intent.udyam", value: true }],
  },
  {
    pattern: /(?<![\p{L}\p{N}])(?:dpiit|startup\s+india|startup\s+recognition)(?![\p{L}\p{N}])/iu,
    extract: () => [{ fact: "intent.dpiit", value: true }],
  },
  {
    pattern: /(?<![\p{L}\p{N}])(?:export|import)(?![\p{L}\p{N}])/iu,
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
