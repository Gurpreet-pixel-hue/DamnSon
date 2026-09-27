import fs from "node:fs";
import path from "node:path";
import {
  journeyTemplateSchema,
  approvalModuleSchema,
  type JourneyTemplate,
  type ApprovalModule,
} from "@/lib/contract/schema";
import { analyzeTemplate } from "@/lib/contract/analyze";

export interface JourneyBundle {
  template: JourneyTemplate;
  modules: ApprovalModule[];
}

/**
 * Development-only server loader for v3 fixture templates and pinned modules.
 * Note: Switch to lib/server/journeys after PL-2 (#4) is merged.
 */
export async function loadJourneyForPage(
  searchParams?: { [key: string]: string | string[] | undefined }
): Promise<JourneyBundle | null> {
  const isDev = process.env.NODE_ENV !== "production";
  const isFixtures = process.env.DATA_SOURCE === "fixtures";

  // Production build refuses fixture loading
  if (!isDev || !isFixtures) {
    return null;
  }

  const graphParam = searchParams?.["graph"];

  // C6: Development-only ?graph=broken returns an in-memory template pinning a missing module
  if (graphParam === "broken") {
    const dummyTemplate: JourneyTemplate = {
      schemaVersion: 3,
      taskId: "broken-test",
      revision: 1,
      title: "[Synthetic] Broken Template",
      summary: "Template pinning a missing module for composition failure testing.",
      jurisdiction: { country: "IN", state: "Maharashtra" },
      category: "business_and_trade",
      keywords: ["broken"],
      sources: [],
      questions: [],
      modules: [
        {
          moduleId: "missing-module",
          version: 1,
          requirement: "mandatory",
          activation: null,
          reason: "Tests composition failure",
        },
      ],
      links: [],
      meta: { origin: "curated", updatedAt: "2026-09-27T10:00:00+05:30" },
    };
    return { template: dummyTemplate, modules: [] };
  }

  const templateName =
    graphParam === "stress" ? "stress-25-synthetic" : "demo-metro-synthetic";

  try {
    const fixturesDir = path.join(process.cwd(), "data", "fixtures", "v3");
    const templatePath = path.join(
      fixturesDir,
      "templates",
      `${templateName}.json`
    );

    if (!fs.existsSync(templatePath)) {
      return null;
    }

    const rawTemplate = JSON.parse(fs.readFileSync(templatePath, "utf8"));
    const parsedTemplate = journeyTemplateSchema.safeParse(rawTemplate);
    if (!parsedTemplate.success) {
      console.error(
        "[loadJourney] template zod validation failed:",
        parsedTemplate.error.issues
      );
      return null;
    }

    const template = parsedTemplate.data;
    const modules: ApprovalModule[] = [];

    for (const modEntry of template.modules) {
      const modulePath = path.join(
        fixturesDir,
        "modules",
        `${modEntry.moduleId}.json`
      );
      if (!fs.existsSync(modulePath)) {
        console.error(
          `[loadJourney] pinned module ${modEntry.moduleId} not found at ${modulePath}`
        );
        return null;
      }

      const rawModule = JSON.parse(fs.readFileSync(modulePath, "utf8"));
      const parsedModule = approvalModuleSchema.safeParse(rawModule);
      if (!parsedModule.success) {
        console.error(
          `[loadJourney] module ${modEntry.moduleId} zod validation failed:`,
          parsedModule.error.issues
        );
        return null;
      }
      modules.push(parsedModule.data);
    }

    const analysis = analyzeTemplate(template, modules);
    if (!analysis.ok) {
      console.error(
        "[loadJourney] analyzeTemplate failed:",
        analysis.issues.map((i) => i.code)
      );
      return null;
    }

    return { template, modules };
  } catch (err) {
    console.error("[loadJourney] unexpected error:", err);
    return null;
  }
}
