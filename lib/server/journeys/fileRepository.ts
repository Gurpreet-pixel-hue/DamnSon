import "server-only";
import fs from "node:fs";
import path from "node:path";
import { analyzeTemplate } from "@/lib/contract/analyze";
import type { PublishedJourneyResponse, TemplateSummary } from "@/lib/contract/api";
import {
  approvalModuleSchema,
  journeyTemplateSchema,
  type ApprovalModule,
  type JourneyTemplate,
} from "@/lib/contract/schema";
import { applyListFilters, toSummary } from "./summary";
import type { JourneyRepository } from "./types";

export interface FileJourneyRepositoryOptions {
  /** data/seed — verified content, always read. */
  seedDir: string;
  /** data/fixtures/v3 — synthetic, read only when dataSource is "fixtures". */
  fixtureDir: string;
  dataSource?: string | undefined;
  nodeEnv?: string | undefined;
}

interface Journey {
  template: JourneyTemplate;
  modules: ApprovalModule[];
}

const moduleKey = (moduleId: string, version: number): string => `${moduleId}@${version}`;

function jsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.error(`journeys: cannot read ${dir}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function readJson(file: string): unknown | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch (error) {
    console.error(`journeys: ${path.basename(file)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/**
 * Reads published journeys from disk (§6.6 "Database down" and local development).
 * Files are read with fs and never imported, so fixtures can never be bundled into a production build.
 */
export function createFileJourneyRepository(options: FileJourneyRepositoryOptions): JourneyRepository {
  const { seedDir, fixtureDir, dataSource, nodeEnv } = options;
  const useFixtures = dataSource === "fixtures";

  if (nodeEnv === "production" && useFixtures) {
    throw new Error("DATA_SOURCE=fixtures is refused in production: synthetic data must never be served to citizens");
  }

  const roots = useFixtures ? [seedDir, fixtureDir] : [seedDir];

  function load(): { journeys: Journey[]; byTaskId: Map<string, Journey> } {
    const modulesByKey = new Map<string, ApprovalModule>();
    for (const root of roots) {
      for (const name of jsonFiles(path.join(root, "modules"))) {
        const file = path.join(root, "modules", name);
        const raw = readJson(file);
        if (raw === undefined) continue;
        const parsed = approvalModuleSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(`journeys: ${name} failed the module schema: ${parsed.error.issues.map((i) => i.path.map(String).join(".")).join(", ")}`);
          continue;
        }
        const key = moduleKey(parsed.data.moduleId, parsed.data.version);
        if (modulesByKey.has(key)) {
          console.error(`journeys: ${name} duplicates module ${key}, keeping the first file read`);
          continue;
        }
        modulesByKey.set(key, parsed.data);
      }
    }

    const allModules = [...modulesByKey.values()];
    const journeys: Journey[] = [];
    const byTaskId = new Map<string, Journey>();

    for (const root of roots) {
      for (const name of jsonFiles(path.join(root, "templates"))) {
        const file = path.join(root, "templates", name);
        const raw = readJson(file);
        if (raw === undefined) continue;
        const parsed = journeyTemplateSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(`journeys: ${name} failed the template schema: ${parsed.error.issues.map((i) => i.path.map(String).join(".")).join(", ")}`);
          continue;
        }
        const template = parsed.data;
        if (byTaskId.has(template.taskId)) {
          console.error(`journeys: ${name} duplicates taskId ${template.taskId}, keeping the first file read`);
          continue;
        }

        const analysis = analyzeTemplate(template, allModules);
        if (!analysis.ok) {
          const codes = [...new Set(analysis.issues.filter((i) => i.severity === "error").map((i) => i.code))];
          console.error(`journeys: ${name} is not servable, issues [${codes.join(", ")}]`);
          continue;
        }

        // analyzeTemplate reports UNKNOWN_MODULE for a pin it cannot resolve, so every pin exists here.
        const pinned: ApprovalModule[] = [];
        for (const pin of template.modules) {
          const pinnedModule = modulesByKey.get(moduleKey(pin.moduleId, pin.version));
          if (pinnedModule === undefined) {
            console.error(`journeys: ${name} pins ${moduleKey(pin.moduleId, pin.version)}, which is missing`);
            pinned.length = 0;
            break;
          }
          pinned.push(pinnedModule);
        }
        if (pinned.length === 0) continue;

        const journey: Journey = { template, modules: pinned };
        journeys.push(journey);
        byTaskId.set(template.taskId, journey);
      }
    }

    return { journeys, byTaskId };
  }

  return {
    listTemplates(opts): Promise<TemplateSummary[]> {
      const summaries = load().journeys.map((journey) => toSummary(journey.template, journey.modules));
      return Promise.resolve(applyListFilters(summaries, opts));
    },

    getPublishedJourney(taskId): Promise<PublishedJourneyResponse | null> {
      const journey = load().byTaskId.get(taskId);
      if (journey === undefined) return Promise.resolve(null);
      return Promise.resolve({
        template: journey.template,
        modules: journey.modules,
        publishedAt: journey.template.meta.updatedAt,
      });
    },
  };
}
