import "server-only";
import path from "node:path";
import { createFileJourneyRepository } from "./fileRepository";
import type { JourneyRepository } from "./types";

export type { JourneyRepository } from "./types";
export { searchTemplates } from "./search";

/**
 * Picks the repository from DATA_SOURCE (§13.6): "files" (default) and "fixtures" read data/,
 * "db" is added in PL-3. Deploys set "db"; setting "files" serves data/seed read-only (§6.6).
 */
export function getJourneyRepository(): JourneyRepository {
  const dataSource = process.env["DATA_SOURCE"] ?? "files";

  if (dataSource === "db") {
    throw new Error("DATA_SOURCE=db is not implemented yet: the database repository arrives with PL-3");
  }
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
