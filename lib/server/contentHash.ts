import "server-only";
import { createHash } from "node:crypto";

/**
 * Canonical JSON: object keys sorted, array order kept, undefined dropped.
 *
 * Keys are compared by code point rather than with localeCompare, which is locale-dependent and would
 * make the same document hash differently on two machines.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value === "object" && value !== null) {
    const source: Record<string, unknown> = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      const entry = source[key];
      if (entry !== undefined) sorted[key] = canonicalise(entry);
    }
    return sorted;
  }
  return value;
}

/**
 * SHA-256 of the canonical JSON: the contentHash used for published versions and for the optimistic
 * concurrency check when an admin saves a draft (§10.1 "Publish semantics").
 */
export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
