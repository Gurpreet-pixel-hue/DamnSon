import type { PublishedJourneyResponse, TemplateSummary } from "@/lib/contract/api";
import { safeCompose } from "@/lib/graph/safeCompose";
import type { ComposedJourney } from "@/lib/contract/compose";

/**
 * Local repository interface for loading journeys on the page without importing "server-only" (P8).
 */
export interface JourneyRepository {
  listTemplates(opts?: { q?: string; city?: string }): Promise<TemplateSummary[]>;
  getPublishedJourney(taskId: string): Promise<PublishedJourneyResponse | null>;
}

export type LoadJourneyPageResult =
  | {
      kind: "ok";
      data: {
        published: PublishedJourneyResponse;
        journey: ComposedJourney;
      };
    }
  | { kind: "not_found" }
  | { kind: "invalid"; issues: string[] };

/**
 * Loads and composes a published journey for a given taskId (P8 & §11.2).
 */
export async function loadJourneyPage(
  repo: JourneyRepository,
  taskId: string
): Promise<LoadJourneyPageResult> {
  try {
    const published = await repo.getPublishedJourney(taskId);
    if (!published) {
      return { kind: "not_found" };
    }

    const composeResult = safeCompose(
      published.template,
      published.modules,
      {}
    );

    if (!composeResult.ok) {
      return {
        kind: "invalid",
        issues: composeResult.codes.length > 0 ? composeResult.codes : [composeResult.message ?? "Invalid journey graph"],
      };
    }

    return {
      kind: "ok",
      data: {
        published,
        journey: composeResult.journey,
      },
    };
  } catch (err) {
    return {
      kind: "invalid",
      issues: [err instanceof Error ? err.message : String(err)],
    };
  }
}
