// Shared by scripts/validate-seed.ts and scripts/seed.ts, so the check that gates a PR and the check
// that gates a database write can never disagree about what counts as valid seed data.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { analyzeModule, analyzeTemplate, type GraphAnalysis } from "../lib/contract/analyze";
import {
  approvalModuleSchema,
  journeyTemplateSchema,
  type ApprovalModule,
  type JourneyTemplate,
} from "../lib/contract/schema";

export interface SeedFile<T> {
  /** Path relative to the working directory, for printing. */
  label: string;
  value: T;
  analysis: GraphAnalysis;
}

export interface SeedFailure {
  label: string;
  details: string[];
}

export interface SeedLoad {
  modules: SeedFile<ApprovalModule>[];
  templates: SeedFile<JourneyTemplate>[];
  /** Files that could not be read or did not match the schema. */
  failures: SeedFailure[];
}

/** A missing folder counts as empty. */
function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
}

function zodDetails(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string[] {
  return issues.map((issue) => `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`);
}

export const errorCodes = (analysis: GraphAnalysis): string[] => [
  ...new Set(analysis.issues.filter((i) => i.severity === "error").map((i) => i.code)),
];
export const warningCodes = (analysis: GraphAnalysis): string[] => [
  ...new Set(analysis.issues.filter((i) => i.severity === "warning").map((i) => i.code)),
];

/** True when every file parsed and no module or template has an analyzer error. */
export function isServable(load: SeedLoad): boolean {
  if (load.failures.length > 0) return false;
  return [...load.modules, ...load.templates].every((file) => file.analysis.ok);
}

/**
 * Reads <root>/modules/*.json and <root>/templates/*.json, validates each with zod, then runs
 * analyzeModule on every module and analyzeTemplate on every template against those modules (§8.7).
 */
export function loadSeedRoot(root: string): SeedLoad {
  const cwd = process.cwd();
  const modules: SeedFile<ApprovalModule>[] = [];
  const templates: SeedFile<JourneyTemplate>[] = [];
  const failures: SeedFailure[] = [];

  const read = (file: string, label: string): unknown | undefined => {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as unknown;
    } catch (error) {
      failures.push({ label, details: [`not valid JSON: ${error instanceof Error ? error.message : String(error)}`] });
      return undefined;
    }
  };

  const modulesDir = join(root, "modules");
  for (const name of jsonFiles(modulesDir)) {
    const file = join(modulesDir, name);
    const label = relative(cwd, file);
    const raw = read(file, label);
    if (raw === undefined) continue;
    const parsed = approvalModuleSchema.safeParse(raw);
    if (!parsed.success) {
      failures.push({ label, details: zodDetails(parsed.error.issues) });
      continue;
    }
    modules.push({ label, value: parsed.data, analysis: analyzeModule(parsed.data) });
  }

  const known = modules.map((entry) => entry.value);
  const templatesDir = join(root, "templates");
  for (const name of jsonFiles(templatesDir)) {
    const file = join(templatesDir, name);
    const label = relative(cwd, file);
    const raw = read(file, label);
    if (raw === undefined) continue;
    const parsed = journeyTemplateSchema.safeParse(raw);
    if (!parsed.success) {
      failures.push({ label, details: zodDetails(parsed.error.issues) });
      continue;
    }
    templates.push({ label, value: parsed.data, analysis: analyzeTemplate(parsed.data, known) });
  }

  return { modules, templates, failures };
}
