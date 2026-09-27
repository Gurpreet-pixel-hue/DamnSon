// scripts/validate-seed.ts: validates data/seed against contract v3 (run: npm run validate:seed)
// zod + analyzeModule for every module, analyzeTemplate for every template (PRD §8.7, App. D).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { analyzeModule, analyzeTemplate, type GraphAnalysis } from "../lib/contract/analyze";
import { approvalModuleSchema, journeyTemplateSchema, type ApprovalModule, type JourneyTemplate } from "../lib/contract/schema";

const root = process.cwd();
const modulesDir = join(root, "data", "seed", "modules");
const templatesDir = join(root, "data", "seed", "templates");

let errors = 0;

/** A missing folder counts as empty. */
function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
}

function codes(analysis: GraphAnalysis, severity: "error" | "warning"): string[] {
  return [...new Set(analysis.issues.filter((i) => i.severity === severity).map((i) => i.code))];
}

function fail(label: string, details: string[]): void {
  errors += 1;
  console.error(`FAIL  ${label}`);
  for (const detail of details) console.error(`        ${detail}`);
}

function report(label: string, summary: string, analysis: GraphAnalysis): void {
  const errorCodes = codes(analysis, "error");
  const warningCodes = codes(analysis, "warning");
  if (errorCodes.length > 0) {
    errors += 1;
    console.error(`FAIL  ${label}  ${summary}  errors: ${errorCodes.join(", ")}`);
    for (const i of analysis.issues.filter((x) => x.severity === "error")) {
      console.error(`        ${i.code}: ${i.message}`);
    }
  } else {
    console.log(`ok    ${label}  ${summary}`);
  }
  if (warningCodes.length > 0) console.log(`      warnings: ${warningCodes.join(", ")}`);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function zodDetails(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string[] {
  return issues.map((i) => `${i.path.map(String).join(".") || "<root>"}: ${i.message}`);
}

const modules: ApprovalModule[] = [];
for (const file of jsonFiles(modulesDir)) {
  const path = join(modulesDir, file);
  const label = relative(root, path);
  let raw: unknown;
  try {
    raw = readJson(path);
  } catch (error) {
    fail(label, [`not valid JSON: ${error instanceof Error ? error.message : String(error)}`]);
    continue;
  }
  const parsed = approvalModuleSchema.safeParse(raw);
  if (!parsed.success) {
    fail(label, zodDetails(parsed.error.issues));
    continue;
  }
  modules.push(parsed.data);
  report(label, `${parsed.data.moduleId} v${parsed.data.version}, ${parsed.data.steps.length} steps`, analyzeModule(parsed.data));
}

const templates: JourneyTemplate[] = [];
for (const file of jsonFiles(templatesDir)) {
  const path = join(templatesDir, file);
  const label = relative(root, path);
  let raw: unknown;
  try {
    raw = readJson(path);
  } catch (error) {
    fail(label, [`not valid JSON: ${error instanceof Error ? error.message : String(error)}`]);
    continue;
  }
  const parsed = journeyTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    fail(label, zodDetails(parsed.error.issues));
    continue;
  }
  templates.push(parsed.data);
  report(label, `${parsed.data.taskId} r${parsed.data.revision}, ${parsed.data.modules.length} modules`, analyzeTemplate(parsed.data, modules));
}

console.log(`\n${modules.length} modules, ${templates.length} templates`);
if (errors > 0) {
  console.error(`${errors} file(s) with errors`);
  process.exitCode = 1;
}
