// scripts/contract-schemas.ts: writes docs/contract/*.json from lib/contract (run: npm run contract:schemas)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { FACTS } from "../lib/contract/facts";
import {
  approvalModuleSchema,
  durationSchema,
  edgeSchema,
  feeSchema,
  journeyTemplateSchema,
  questionSchema,
  requirementSchema,
  reviewSchema,
  ruleSchema,
  sourceSchema,
  stepSchema,
  timelineSchema,
} from "../lib/contract/schema";

const out = join(process.cwd(), "docs", "contract");
mkdirSync(out, { recursive: true });

// A local registry names the shared definitions ($defs/Rule, $defs/Step, …) without touching zod's global registry.
const names = z.registry<{ id: string }>();
names.add(ruleSchema, { id: "Rule" });
names.add(sourceSchema, { id: "Source" });
names.add(feeSchema, { id: "Fee" });
names.add(durationSchema, { id: "Duration" });
names.add(timelineSchema, { id: "Timeline" });
names.add(reviewSchema, { id: "Review" });
names.add(requirementSchema, { id: "Requirement" });
names.add(stepSchema, { id: "Step" });
names.add(edgeSchema, { id: "Edge" });
names.add(questionSchema, { id: "Question" });

const write = (file: string, schema: z.ZodType, title: string): void => {
  const json = { ...z.toJSONSchema(schema, { target: "draft-2020-12", io: "input", metadata: names }), title };
  writeFileSync(join(out, file), `${JSON.stringify(json, null, 2)}\n`);
  console.log(`wrote docs/contract/${file}`);
};
write("approval-module.schema.json", approvalModuleSchema, "ApprovalModule (contract v3)");
write("journey-template.schema.json", journeyTemplateSchema, "JourneyTemplate (contract v3)");
writeFileSync(join(out, "facts.json"), `${JSON.stringify(FACTS, null, 2)}\n`);
console.log("wrote docs/contract/facts.json");
