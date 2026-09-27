// scripts/validate-seed.ts: validates data/seed against contract v3 (run: npm run validate:seed).
// Exits 1 on any error, so CI blocks a PR that would break the API or the seed loader.
import { join } from "node:path";
import { errorCodes, loadSeedRoot, warningCodes, type SeedFile } from "./seedFiles";
import type { GraphAnalysis } from "../lib/contract/analyze";

const root = join(process.cwd(), "data", "seed");
const load = loadSeedRoot(root);
let errors = 0;

for (const failure of load.failures) {
  errors += 1;
  console.error(`FAIL  ${failure.label}`);
  for (const detail of failure.details) console.error(`        ${detail}`);
}

function report(file: SeedFile<unknown>, summary: string, analysis: GraphAnalysis): void {
  const codes = errorCodes(analysis);
  if (codes.length > 0) {
    errors += 1;
    console.error(`FAIL  ${file.label}  ${summary}  errors: ${codes.join(", ")}`);
    for (const issue of analysis.issues.filter((i) => i.severity === "error")) {
      console.error(`        ${issue.code}: ${issue.message}`);
    }
  } else {
    console.log(`ok    ${file.label}  ${summary}`);
  }
  const warnings = warningCodes(analysis);
  if (warnings.length > 0) console.log(`      warnings: ${warnings.join(", ")}`);
}

for (const file of load.modules) {
  report(file, `${file.value.moduleId} v${file.value.version}, ${file.value.steps.length} steps`, file.analysis);
}
for (const file of load.templates) {
  report(file, `${file.value.taskId} r${file.value.revision}, ${file.value.modules.length} modules`, file.analysis);
}

console.log(`\n${load.modules.length} modules, ${load.templates.length} templates`);
if (errors > 0) {
  console.error(`${errors} file(s) with errors`);
  process.exitCode = 1;
}
