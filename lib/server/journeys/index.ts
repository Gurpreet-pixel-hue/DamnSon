import "server-only";
import path from "node:path";
import { createDbJourneyRepository } from "./dbRepository";
import { createFileJourneyRepository } from "./fileRepository";
import type { JourneyRepository } from "./types";

export type { JourneyRepository } from "./types";
export { searchTemplates } from "./search";

/**
 * Picks the repository from DATA_SOURCE (§13.6): "db" reads Postgres (what deploys use), "files"
 * serves data/seed read-only (the database-down path, §6.6) and "fixtures" adds synthetic data in dev.
 */
export function getJourneyRepository(): JourneyRepository {
  const dataSource = process.env["DATA_SOURCE"] ?? "files";

  if (dataSource === "db") return createDbJourneyRepository();
  if (dataSource !== "files" && dataSource !== "fixtures") {
    throw new Error(`DATA_SOURCE must be "files", "fixtures" or "db", not ${JSON.stringify(dataSource)}`);
  }

  return createFileJourneyRepository({
    seedDir: path.join(process.cwd(), "data", "seed"),
    fixtureDir: path.join(process.cwd(), "data", "fixtures", "v3"),
    dataSource,
    nodeEnv: process.env["NODE_ENV"],
  });
}
