import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
} from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import { fromJourney } from "./viewModel";
import { getStages, currentStage, getStageForStation } from "./stages";

function loadExampleStartupJourney() {
  const template = journeyTemplateSchema.parse(
    readTemplateFixture("example-startup")
  );
  const moduleNames = [
    "ex-directors",
    "ex-incorporation",
    "ex-banking",
    "ex-tax",
    "ex-food",
    "ex-recognition",
    "ex-local",
  ];
  const modules = moduleNames.map((name) =>
    approvalModuleSchema.parse(readModuleFixture(name))
  );
  const facts = {
    "business.sector": "it_saas",
    "company.founders_count": 2,
    "employees.count": 5,
  };
  const journey = composeJourney(template, modules, facts);
  return { template, modules, facts, journey };
}

describe("stages derivations (§11.1, §11.7)", () => {
  it("a fresh journey is at stage 1; after marking every stage-1 step that applies done, the current stage is the next layer with work; when everything is done, it is the last stage", () => {
    const { journey } = loadExampleStartupJourney();

    // 1. Fresh journey (no completed steps)
    const emptyCompleted = new Set<string>();
    const metroFresh = fromJourney(journey, emptyCompleted);
    const stagesFresh = getStages(metroFresh);

    expect(stagesFresh.length).toBeGreaterThan(1);
    expect(stagesFresh[0]!.number).toBe(1);
    expect(stagesFresh[0]!.label).toBe("1 · Start here");
    expect(currentStage(metroFresh)).toBe(1);

    // 2. Mark every stage-1 step that applies done
    const stage1Stations = stagesFresh[0]!.stations.filter(
      (s) => s.kind !== "milestone" && s.applicability === "applies"
    );
    const completedStage1 = new Set(stage1Stations.map((s) => s.id));
    const metroStage1Done = fromJourney(journey, completedStage1);
    const stagesStage1Done = getStages(metroStage1Done);

    expect(stagesStage1Done[0]!.isDone).toBe(true);
    // The current stage must advance to the next layer with work (stage 2)
    const nextStageWithWork = currentStage(metroStage1Done);
    expect(nextStageWithWork).toBe(2);
    expect(stagesStage1Done[nextStageWithWork - 1]!.hasAvailable).toBe(true);

    // 3. Mark everything done
    const allActionStepIds = journey.steps
      .filter((s) => s.kind !== "milestone" && s.applicability !== "optional")
      .map((s) => s.id);
    const completedAll = new Set(allActionStepIds);
    const metroAllDone = fromJourney(journey, completedAll);
    const stagesAllDone = getStages(metroAllDone);

    // When everything is done, current stage is the last stage
    const lastStageNumber = stagesAllDone[stagesAllDone.length - 1]!.number;
    expect(currentStage(metroAllDone)).toBe(lastStageNumber);
  });

  it("derives stage metadata and station mappings correctly", () => {
    const { journey } = loadExampleStartupJourney();
    const metro = fromJourney(journey, new Set());
    const stages = getStages(metro);

    for (const stage of stages) {
      expect(stage.number).toBe(stage.layer + 1);
      expect(stage.stations.length).toBe(stage.stationIds.length);
      for (const st of stage.stations) {
        expect(getStageForStation(metro, st.id)).toBe(stage.number);
      }
    }

    expect(getStageForStation(metro, "non-existent-step")).toBeNull();
  });

  it("handles empty metro safely", () => {
    const emptyMetro = { stations: [], tracks: [] };
    expect(getStages(emptyMetro)).toEqual([]);
    expect(currentStage(emptyMetro)).toBe(1);
    expect(getStageForStation(emptyMetro, "any")).toBeNull();
  });

  it("gives stage 1 on start-business-mumbai with {} facts (A2 §11.1)", () => {
    const templatePath = join(process.cwd(), "data/seed/templates/start-business-mumbai.json");
    const template = journeyTemplateSchema.parse(JSON.parse(readFileSync(templatePath, "utf8")));
    const modules = template.modules.map((m) => {
      const modPath = join(process.cwd(), "data/seed/modules", `${m.moduleId}.json`);
      return approvalModuleSchema.parse(JSON.parse(readFileSync(modPath, "utf8")));
    });
    const journey = composeJourney(template, modules, {});
    const metro = fromJourney(journey, new Set());

    expect(currentStage(metro)).toBe(1);
  });
});
