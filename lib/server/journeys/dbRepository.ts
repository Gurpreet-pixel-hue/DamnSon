import "server-only";
import type { PublishedJourneyResponse, TemplateSummary } from "@/lib/contract/api";
import {
  approvalModuleSchema,
  journeyTemplateSchema,
  type ApprovalModule,
  type JourneyTemplate,
} from "@/lib/contract/schema";
import { getPrisma } from "../db/client";
import { applyListFilters, toSummary } from "./summary";
import type { JourneyRepository } from "./types";

const moduleKey = (moduleId: string, version: number): string => `${moduleId}@${version}`;

/** Stored JSON is re-validated on read, so a row written by an older contract can never reach the UI (§6.3). */
function parseTemplate(id: string, content: unknown): JourneyTemplate | null {
  const parsed = journeyTemplateSchema.safeParse(content);
  if (!parsed.success) {
    console.error(`journeys: published revision of ${id} does not match contract v3, skipping it`);
    return null;
  }
  return parsed.data;
}

function parseModule(key: string, content: unknown): ApprovalModule | null {
  const parsed = approvalModuleSchema.safeParse(content);
  if (!parsed.success) {
    console.error(`journeys: stored module ${key} does not match contract v3, skipping it`);
    return null;
  }
  return parsed.data;
}

interface PublishedTemplate {
  template: JourneyTemplate;
  publishedAt: string;
}

/** The published pointers are the only source of truth for what a citizen may see (§10.1). */
async function readPublishedTemplates(taskId?: string): Promise<PublishedTemplate[]> {
  const prisma = getPrisma();
  const pointers = await prisma.journeyTemplate.findMany({
    where: { publishedRevisionId: { not: null }, ...(taskId === undefined ? {} : { id: taskId }) },
    select: { id: true, publishedRevisionId: true },
  });

  const revisionIds = pointers.flatMap((pointer) => (pointer.publishedRevisionId === null ? [] : [pointer.publishedRevisionId]));
  if (revisionIds.length === 0) return [];

  const revisions = await prisma.journeyTemplateRevision.findMany({
    where: { id: { in: revisionIds } },
    select: { templateId: true, content: true, publishedAt: true },
  });

  const result: PublishedTemplate[] = [];
  for (const revision of revisions) {
    const template = parseTemplate(revision.templateId, revision.content);
    if (template === null) continue;
    result.push({
      template,
      publishedAt: (revision.publishedAt ?? new Date()).toISOString(),
    });
  }
  return result;
}

/** Loads exactly the module versions the given templates pin, in one query. */
async function readPinnedModules(templates: readonly JourneyTemplate[]): Promise<Map<string, ApprovalModule>> {
  const wanted = new Map<string, { moduleId: string; version: number }>();
  for (const template of templates) {
    for (const pin of template.modules) wanted.set(moduleKey(pin.moduleId, pin.version), pin);
  }
  if (wanted.size === 0) return new Map();

  const prisma = getPrisma();
  const rows = await prisma.approvalModuleVersion.findMany({
    where: { OR: [...wanted.values()].map((pin) => ({ moduleId: pin.moduleId, version: pin.version })) },
    select: { moduleId: true, version: true, content: true },
  });

  const modules = new Map<string, ApprovalModule>();
  for (const row of rows) {
    const key = moduleKey(row.moduleId, row.version);
    const parsed = parseModule(key, row.content);
    if (parsed !== null) modules.set(key, parsed);
  }
  return modules;
}

function resolvePins(template: JourneyTemplate, modules: Map<string, ApprovalModule>): ApprovalModule[] | null {
  const pinned: ApprovalModule[] = [];
  for (const pin of template.modules) {
    const key = moduleKey(pin.moduleId, pin.version);
    const found = modules.get(key);
    if (found === undefined) {
      console.error(`journeys: ${template.taskId} pins ${key}, which is not in the database`);
      return null;
    }
    pinned.push(found);
  }
  return pinned;
}

/** Serves published journeys from Postgres (DATA_SOURCE=db). */
export function createDbJourneyRepository(): JourneyRepository {
  return {
    async listTemplates(opts): Promise<TemplateSummary[]> {
      const published = await readPublishedTemplates();
      const modules = await readPinnedModules(published.map((entry) => entry.template));

      const summaries: TemplateSummary[] = [];
      for (const { template } of published) {
        const pinned = resolvePins(template, modules);
        if (pinned === null) continue;
        summaries.push(toSummary(template, pinned));
      }
      return applyListFilters(summaries, opts);
    },

    async getPublishedJourney(taskId): Promise<PublishedJourneyResponse | null> {
      const published = await readPublishedTemplates(taskId);
      const first = published[0];
      if (first === undefined) return null;

      const modules = await readPinnedModules([first.template]);
      const pinned = resolvePins(first.template, modules);
      if (pinned === null) return null;

      return { template: first.template, modules: pinned, publishedAt: first.publishedAt };
    },
  };
}
