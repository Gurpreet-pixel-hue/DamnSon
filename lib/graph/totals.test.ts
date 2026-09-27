import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { summarizeFees, summarizeTime, toCalendarDays } from "./totals";
import { resolvePath } from "./resolvePath";
import { civicTaskGraphSchema, type CivicTaskGraph } from "./schema";

function loadExample(): CivicTaskGraph {
  const filePath = path.resolve(
    process.cwd(),
    "data/fixtures/valid/example-graph.json"
  );
  return civicTaskGraphSchema.parse(
    JSON.parse(fs.readFileSync(filePath, "utf8"))
  );
}

describe("totals", () => {
  describe("toCalendarDays", () => {
    it("converts working days to calendar days by rounding up (days * 7 / 5)", () => {
      expect(toCalendarDays(0, "working")).toBe(0);
      expect(toCalendarDays(1, "working")).toBe(2);
      expect(toCalendarDays(2, "working")).toBe(3);
      expect(toCalendarDays(3, "working")).toBe(5);
      expect(toCalendarDays(7, "working")).toBe(10);
    });

    it("returns calendar days unchanged", () => {
      expect(toCalendarDays(5, "calendar")).toBe(5);
      expect(toCalendarDays(10, "calendar")).toBe(10);
    });
  });

  describe("summarizeFees", () => {
    it("matches exact expectations for {} with none completed", () => {
      const graph = loadExample();
      const resolved = resolvePath(graph, {});
      const fees = summarizeFees(resolved, new Set());

      expect(fees).toEqual({
        minINR: 600,
        maxINR: 1600,
        unconfirmedCount: 1,
        undecidedCount: 1,
      });
    });

    it('matches exact expectations for {"large-premises": false} with none completed', () => {
      const graph = loadExample();
      const resolved = resolvePath(graph, { "large-premises": false });
      const fees = summarizeFees(resolved, new Set());

      expect(fees).toEqual({
        minINR: 600,
        maxINR: 1600,
        unconfirmedCount: 0,
        undecidedCount: 0,
      });
    });

    it('matches exact expectations for {"large-premises": true} with none completed', () => {
      const graph = loadExample();
      const resolved = resolvePath(graph, { "large-premises": true });
      const fees = summarizeFees(resolved, new Set());

      expect(fees).toEqual({
        minINR: 600,
        maxINR: 1600,
        unconfirmedCount: 1,
        undecidedCount: 0,
      });
    });

    it('matches exact expectations for {"large-premises": false} with {apply-online} completed', () => {
      const graph = loadExample();
      const resolved = resolvePath(graph, { "large-premises": false });
      const fees = summarizeFees(resolved, new Set(["apply-online"]));

      expect(fees).toEqual({
        minINR: 500,
        maxINR: 1500,
        unconfirmedCount: 0,
        undecidedCount: 0,
      });
    });
  });

  describe("summarizeTime", () => {
    it("matches exact expectations for {} with none completed", () => {
      const graph = loadExample();
      const resolved = resolvePath(graph, {});
      const time = summarizeTime(resolved, new Set());

      expect(time).toEqual({
        minDays: 7,
        maxDays: 15,
        unknownCount: 1,
        criticalStepIds: [
          "apply-online",
          "site-inspection",
          "licence-issued",
        ],
      });
    });

    it('matches exact expectations for {"large-premises": false} with none completed', () => {
      const graph = loadExample();
      const resolved = resolvePath(graph, { "large-premises": false });
      const time = summarizeTime(resolved, new Set());

      expect(time).toEqual({
        minDays: 7,
        maxDays: 15,
        unknownCount: 0,
        criticalStepIds: [
          "apply-online",
          "site-inspection",
          "licence-issued",
        ],
      });
    });

    it('matches exact expectations for {"large-premises": false} with {apply-online, site-inspection} completed', () => {
      const graph = loadExample();
      const resolved = resolvePath(graph, { "large-premises": false });
      const time = summarizeTime(
        resolved,
        new Set(["apply-online", "site-inspection"])
      );

      expect(time).toEqual({
        minDays: 2,
        maxDays: 3,
        unknownCount: 0,
        criticalStepIds: [
          "apply-online",
          "site-inspection",
          "licence-issued",
        ],
      });
    });
  });
});
