import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { encodeShareState, decodeShareState } from "@/lib/graph/shareState";
import type { Facts } from "@/lib/contract/facts";
import { journeyTemplateSchema, approvalModuleSchema } from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";

describe("Map My Route round trip (C5)", () => {
  it("encodes landing facts into PRD §8.8 share format and decodes accurately", () => {
    const landingFacts: Facts = {
      "business.serves_food": true,
      "business.sector": "food_service",
      "employees.count": 5,
      "location.city": "Mumbai",
      "location.state": "Maharashtra",
    };

    const query = encodeShareState({
      taskId: "start-business-mumbai",
      facts: landingFacts,
      completed: [],
    });

    const params = new URLSearchParams(query);
    const decoded = decodeShareState(params);

    expect(decoded).not.toBeNull();
    expect(decoded?.taskId).toBe("start-business-mumbai");
    expect(decoded?.facts["business.serves_food"]).toBe(true);
    expect(decoded?.facts["business.sector"]).toBe("food_service");
    expect(decoded?.facts["employees.count"]).toBe(5);
    expect(decoded?.facts["location.city"]).toBe("Mumbai");
    expect(decoded?.facts["location.state"]).toBe("Maharashtra");
  });

  it("activates FSSAI module and stations when serves_food=true on start-business-mumbai", () => {
    // Load real template and modules
    const templateRaw = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), "data/seed/templates/start-business-mumbai.json"),
        "utf8"
      )
    );
    const template = journeyTemplateSchema.parse(templateRaw);

    // Load all modules referenced by start-business-mumbai
    const moduleNames = template.modules.map((m) => m.moduleId);
    const modules = moduleNames.map((name) => {
      const raw = JSON.parse(
        fs.readFileSync(
          path.resolve(process.cwd(), `data/seed/modules/${name}.json`),
          "utf8"
        )
      );
      return approvalModuleSchema.parse(raw);
    });

    // 1. Without food (e.g. IT SaaS, serves_food: false): FSSAI is excluded
    const journeyNonFood = composeJourney(template, modules, {
      "business.serves_food": false,
      "business.sector": "it_saas",
    });
    const fssaiNonFood = journeyNonFood.steps.filter((s) => s.moduleId === "fssai");
    expect(fssaiNonFood.length).toBe(0);
    const excludedFssai = journeyNonFood.excluded.find((e) => e.moduleId === "fssai");
    expect(excludedFssai).toBeDefined();

    // 2. With serves_food=true: FSSAI stations are included with applicability: "applies"
    const journeyWithFood = composeJourney(template, modules, {
      "business.serves_food": true,
      "business.sector": "food_service",
      "employees.count": 5,
    });
    const fssaiSteps = journeyWithFood.steps.filter((s) => s.moduleId === "fssai");
    expect(fssaiSteps.length).toBeGreaterThan(0);
    expect(fssaiSteps.some((s) => s.title.includes("FSSAI"))).toBe(true);
  });
});
