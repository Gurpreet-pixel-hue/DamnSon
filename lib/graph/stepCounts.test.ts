import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { composeJourney } from "@/lib/contract/compose";
import { approvalModuleSchema, journeyTemplateSchema } from "@/lib/contract/schema";
import { parseFacts } from "@/lib/contract/facts";
import { deriveStepCounts } from "./stepCounts";

const root = new URL("../../data/seed/", import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const template = journeyTemplateSchema.parse(readJson("templates/start-business-mumbai.json"));
const modules = readdirSync(new URL("modules/", root))
  .filter((file) => file.endsWith(".json"))
  .map((file) => approvalModuleSchema.parse(readJson(`modules/${file}`)));

const demoFacts = parseFacts({
  "business.entity_type": "private_limited",
  "business.sector": "food_service",
  "business.serves_food": true,
  "employees.count": 5,
});

describe("deriveStepCounts", () => {
  it("never counts milestones, so the print page and panels agree", () => {
    const journey = composeJourney(template, modules, demoFacts);
    const counts = deriveStepCounts(journey);
    const milestones = journey.steps.filter((step) => step.kind === "milestone").length;
    expect(milestones).toBeGreaterThan(0);
    expect(counts.total).toBe(journey.steps.length - milestones);
    expect(counts.applies + counts.mayApply + counts.optional).toBe(counts.total);
    expect(counts.verified).toBeLessThanOrEqual(counts.total);
  });

  it("matches the template summary's step count on the maximal journey", () => {
    const maximal = composeJourney(template, modules, {}, { maximal: true });
    const actionSteps = maximal.steps.filter((step) => step.kind !== "milestone");
    expect(deriveStepCounts(maximal).total).toBe(actionSteps.length);
  });
});
