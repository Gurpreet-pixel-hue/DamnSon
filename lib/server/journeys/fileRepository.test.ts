import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { push, readJsonRecord } from "@/data/fixtures/v3/loadFixture";
import { createFileJourneyRepository } from "./fileRepository";

// Builds a throwaway data root so the tests never depend on what is in data/seed (Pruthviraj's lane).
const MODULES = ["ex-banking", "ex-directors", "ex-food", "ex-incorporation", "ex-local", "ex-recognition", "ex-tax"];
const realFixtures = join(process.cwd(), "data", "fixtures", "v3");

let root: string;
let seedDir: string;
let fixtureDir: string;

function repository(): ReturnType<typeof createFileJourneyRepository> {
  return createFileJourneyRepository({ seedDir, fixtureDir, dataSource: "fixtures", nodeEnv: "test" });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "civicweave-journeys-"));
  seedDir = join(root, "seed");
  fixtureDir = join(root, "fixtures");
  for (const dir of [seedDir, fixtureDir]) {
    mkdirSync(join(dir, "modules"), { recursive: true });
    mkdirSync(join(dir, "templates"), { recursive: true });
  }
  for (const name of MODULES) {
    copyFileSync(join(realFixtures, "modules", `${name}.json`), join(fixtureDir, "modules", `${name}.json`));
  }
  copyFileSync(join(realFixtures, "templates", "example-startup.json"), join(fixtureDir, "templates", "a-example.json"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("createFileJourneyRepository", () => {
  it("refuses fixtures in production", () => {
    expect(() => createFileJourneyRepository({ seedDir, fixtureDir, dataSource: "fixtures", nodeEnv: "production" })).toThrow(
      /refused in production/,
    );
  });

  it("does not read the fixture folder unless DATA_SOURCE is fixtures", async () => {
    const filesOnly = createFileJourneyRepository({ seedDir, fixtureDir, dataSource: "files", nodeEnv: "test" });
    await expect(filesOnly.listTemplates()).resolves.toEqual([]);
  });

  it("summarises a template from its maximal composition", async () => {
    const templates = await repository().listTemplates();
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      taskId: "example-startup",
      revision: 1,
      category: "business_and_trade",
      jurisdiction: { state: "Maharashtra", city: "Mumbai" },
      // 10 composed steps maximally, of which ex-incorporation.incorporated is a milestone.
      stepCount: 9,
      verifiedStepCount: 4,
    });
    expect(templates[0]?.questionFacts).toEqual([
      "business.sector",
      "business.serves_food",
      "company.founders_count",
      "employees.count",
      "intent.dpiit",
    ]);
  });

  it("returns exactly the pinned module versions", async () => {
    const journey = await repository().getPublishedJourney("example-startup");
    expect(journey).not.toBeNull();
    expect(journey?.modules.map((m) => `${m.moduleId}@${m.version}`).sort()).toEqual(MODULES.map((m) => `${m}@1`).sort());
    expect(journey?.publishedAt).toBe("2026-09-26T10:00:00+05:30");
  });

  it("returns null for an unpublished id", async () => {
    await expect(repository().getPublishedJourney("no-such-journey")).resolves.toBeNull();
  });

  it("skips a file that is not valid JSON and keeps the rest", async () => {
    writeFileSync(join(fixtureDir, "templates", "b-broken.json"), "{ not json");
    const templates = await repository().listTemplates();
    expect(templates.map((t) => t.taskId)).toEqual(["example-startup"]);
    expect(console.error).toHaveBeenCalled();
  });

  it("skips a schema-invalid module and the template that pins it", async () => {
    rmSync(join(fixtureDir, "modules", "ex-tax.json"));
    writeFileSync(join(fixtureDir, "modules", "ex-tax.json"), JSON.stringify({ schemaVersion: 3, moduleId: "ex-tax" }));
    await expect(repository().listTemplates()).resolves.toEqual([]);
  });

  it("keeps the first file read when two templates claim the same taskId", async () => {
    copyFileSync(join(realFixtures, "templates", "example-startup.json"), join(fixtureDir, "templates", "z-duplicate.json"));
    const templates = await repository().listTemplates();
    expect(templates).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("z-duplicate.json"));
  });

  it("skips a template whose graph does not analyse", async () => {
    const broken = join(fixtureDir, "templates", "a-example.json");
    const doc = readJsonRecord(broken);
    push(doc, ["links"], { id: "l-cycle", fromModule: "ex-local", toModule: "ex-directors", kind: "requires" });
    writeFileSync(broken, JSON.stringify(doc));
    await expect(repository().listTemplates()).resolves.toEqual([]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("CYCLE"));
  });

  it("filters by city and ranks by query", async () => {
    const repo = repository();
    await expect(repo.listTemplates({ city: "mumbai" })).resolves.toHaveLength(1);
    await expect(repo.listTemplates({ city: "Pune" })).resolves.toEqual([]);
    await expect(repo.listTemplates({ q: "example" })).resolves.toHaveLength(1);
    await expect(repo.listTemplates({ q: "zzzz" })).resolves.toEqual([]);
  });
});
