// Test-only helpers for the contract v3 fixtures (PRD App. D.7).
// Only *.test.ts may import this: ESLint's no-restricted-imports keeps data/fixtures out of
// production code paths (PRD §9.1), and this file is covered by the same pattern.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type JsonRecord = Record<string, unknown>;
type Holder = JsonRecord | unknown[];

const fixtureDir = join(process.cwd(), "data", "fixtures", "v3");

/** Parse a JSON file into a mutable record. Fixtures are addressed by name, never globbed. */
export function readJsonRecord(path: string): JsonRecord {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} is not a JSON object`);
  }
  // The runtime check above establishes the shape; this only narrows it for field access.
  return value as JsonRecord;
}

export const readModuleFixture = (name: string): JsonRecord => readJsonRecord(join(fixtureDir, "modules", `${name}.json`));
export const readTemplateFixture = (name: string): JsonRecord => readJsonRecord(join(fixtureDir, "templates", `${name}.json`));

function child(holder: Holder, key: string | number): unknown {
  return Array.isArray(holder) ? holder[Number(key)] : holder[String(key)];
}

/** Walk to the array or object that holds the field a mutation targets. */
function holderAt(doc: JsonRecord, path: readonly (string | number)[]): Holder {
  let current: Holder = doc;
  for (const key of path) {
    const next = child(current, key);
    if (Array.isArray(next)) {
      current = next;
    } else if (typeof next === "object" && next !== null) {
      current = next as JsonRecord;
    } else {
      throw new Error(`no container at ${path.join(".")}`);
    }
  }
  return current;
}

/** Set one field, so each D.7 mutation is a single readable line. */
export function set(doc: JsonRecord, path: readonly (string | number)[], key: string | number, value: unknown): void {
  const holder = holderAt(doc, path);
  if (Array.isArray(holder)) holder[Number(key)] = value;
  else holder[String(key)] = value;
}

/** Delete one field (splices when the holder is an array). */
export function del(doc: JsonRecord, path: readonly (string | number)[], key: string): void {
  const holder = holderAt(doc, path);
  if (Array.isArray(holder)) holder.splice(Number(key), 1);
  else delete holder[key];
}

/** Append to an array inside the document. */
export function push(doc: JsonRecord, path: readonly (string | number)[], value: unknown): void {
  const holder = holderAt(doc, path);
  if (!Array.isArray(holder)) throw new Error(`${path.join(".")} is not an array`);
  holder.push(value);
}
