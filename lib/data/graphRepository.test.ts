import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createGraphRepository } from "./graphRepository";

describe("graphRepository", () => {
  it("throws when dataSource is fixtures in production", () => {
    expect(() =>
      createGraphRepository({
        seedDir: "/tmp/seed",
        demoDir: "/tmp/demo",
        dataSource: "fixtures",
        nodeEnv: "production",
      })
    ).toThrow("Cannot use fixtures data source in production environment");
  });

  it("loads only valid files and skips invalid and duplicate tasks", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "damnson-repo-test-")
    );
    const seedDir = path.join(tempDir, "seed");
    const demoDir = path.join(tempDir, "demo");
    fs.mkdirSync(seedDir);
    fs.mkdirSync(demoDir);

    const validExample = JSON.parse(
      fs.readFileSync("data/fixtures/valid/example-graph.json", "utf8")
    );

    // 1. Valid seed file
    fs.writeFileSync(
      path.join(seedDir, "valid.json"),
      JSON.stringify(validExample, null, 2)
    );

    // 2. Invalid graph file (cycle)
    const cycleGraph = JSON.parse(
      fs.readFileSync("data/fixtures/invalid-graph/cycle.json", "utf8")
    );
    cycleGraph.taskId = "cycle-task";
    fs.writeFileSync(
      path.join(seedDir, "invalid-cycle.json"),
      JSON.stringify(cycleGraph, null, 2)
    );

    // 3. Duplicate task ID in demo dir
    fs.writeFileSync(
      path.join(demoDir, "duplicate.json"),
      JSON.stringify(validExample, null, 2)
    );

    // 4. Another valid task in demo dir
    const anotherValid = JSON.parse(JSON.stringify(validExample));
    anotherValid.taskId = "another-valid-task";
    anotherValid.title = "Another Valid Task";
    fs.writeFileSync(
      path.join(demoDir, "another.json"),
      JSON.stringify(anotherValid, null, 2)
    );

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const repo = createGraphRepository({
      seedDir,
      demoDir,
      dataSource: "fixtures",
      nodeEnv: "development",
    });

    const tasks = await repo.listTasks();
    expect(tasks.length).toBe(2);
    expect(tasks.map((t) => t.taskId).sort()).toEqual([
      "another-valid-task",
      "example-diamond",
    ]);

    const task1 = tasks.find((t) => t.taskId === "example-diamond");
    expect(task1?.synthetic).toBe(false);

    const task2 = tasks.find((t) => t.taskId === "another-valid-task");
    expect(task2?.synthetic).toBe(true);

    const loadedGraph = await repo.getGraph("example-diamond");
    expect(loadedGraph?.taskId).toBe("example-diamond");

    const nonExistent = await repo.getGraph("ghost-task");
    expect(nonExistent).toBeNull();

    consoleErrorSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
