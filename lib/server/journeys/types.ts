import "server-only";
import type { PublishedJourneyResponse, TemplateSummary } from "@/lib/contract/api";

/**
 * How the BFF reads published journeys. Implemented by fileRepository (data/seed, plus
 * data/fixtures/v3 in development) and, from PL-3, by dbRepository (§6.2, §10.1).
 */
export interface JourneyRepository {
  listTemplates(opts?: { q?: string; city?: string }): Promise<TemplateSummary[]>;
  getPublishedJourney(taskId: string): Promise<PublishedJourneyResponse | null>;
}
