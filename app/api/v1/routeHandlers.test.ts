import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  errorBodySchema,
  healthResponseSchema,
  publishedJourneyResponseSchema,
  templateListResponseSchema,
} from "@/lib/contract/api";
import { GET as getHealth } from "./health/route";
import { GET as getTemplate } from "./templates/[taskId]/route";
import { GET as listTemplates } from "./templates/route";

// DATA_SOURCE=fixtures serves data/fixtures/v3, so these tests never depend on data/seed being filled in.
// Assertions look for example-startup rather than an exact count: FE-2 adds more synthetic templates there.
const previous = process.env["DATA_SOURCE"];
beforeEach(() => {
  process.env["DATA_SOURCE"] = "fixtures";
});
afterEach(() => {
  vi.restoreAllMocks();
  if (previous === undefined) delete process.env["DATA_SOURCE"];
  else process.env["DATA_SOURCE"] = previous;
});

const request = (url: string, headers?: Record<string, string>): NextRequest =>
  new NextRequest(`http://localhost${url}`, headers === undefined ? undefined : { headers });
const params = (taskId: string): RouteContext<"/api/v1/templates/[taskId]"> => ({ params: Promise.resolve({ taskId }) });

describe("GET /api/v1/templates", () => {
  it("200: returns summaries that satisfy the contract", async () => {
    const response = await listTemplates(request("/api/v1/templates"));
    expect(response.status).toBe(200);
    const body = templateListResponseSchema.parse(await response.json());
    expect(body.templates.map((t) => t.taskId)).toContain("example-startup");
  });

  it("200: q ranks and filters", async () => {
    const hit = templateListResponseSchema.parse(await (await listTemplates(request("/api/v1/templates?q=example"))).json());
    expect(hit.templates.map((t) => t.taskId)).toContain("example-startup");
    const miss = templateListResponseSchema.parse(await (await listTemplates(request("/api/v1/templates?q=zzzzzz"))).json());
    expect(miss.templates).toEqual([]);
  });

  it("200: city filters", async () => {
    const other = templateListResponseSchema.parse(await (await listTemplates(request("/api/v1/templates?city=Chennai"))).json());
    expect(other.templates).toEqual([]);
  });

  it("400: rejects an over-long q with the error envelope", async () => {
    const response = await listTemplates(request(`/api/v1/templates?q=${"a".repeat(301)}`));
    expect(response.status).toBe(400);
    const body = errorBodySchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_request");
    expect(JSON.stringify(body)).not.toContain("at Object");
  });
});

describe("degradation", () => {
  it("500: DATA_SOURCE=db is not wired up yet, and the reason never reaches the client", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env["DATA_SOURCE"] = "db";
    const response = await listTemplates(request("/api/v1/templates"));
    expect(response.status).toBe(500);
    const body = errorBodySchema.parse(await response.json());
    expect(body.error.code).toBe("internal");
    expect(body.error.message).toBe("Could not list journeys.");
    expect(JSON.stringify(body)).not.toContain("PL-3");
  });
});

describe("GET /api/v1/templates/[taskId]", () => {
  it("200: returns the template and exactly its pinned modules", async () => {
    const response = await getTemplate(request("/api/v1/templates/example-startup"), params("example-startup"));
    expect(response.status).toBe(200);
    const body = publishedJourneyResponseSchema.parse(await response.json());
    expect(body.template.taskId).toBe("example-startup");
    expect(body.modules).toHaveLength(body.template.modules.length);
    expect(body.publishedAt).toBe("2026-09-26T10:00:00+05:30");
  });

  it("400: rejects an id that is not kebab-case", async () => {
    const response = await getTemplate(request("/api/v1/templates/Bad%20Id"), params("Bad Id"));
    expect(response.status).toBe(400);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe("invalid_request");
  });

  it("404: unknown id", async () => {
    const response = await getTemplate(request("/api/v1/templates/no-such-journey"), params("no-such-journey"));
    expect(response.status).toBe(404);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe("not_found");
  });
});

describe("GET /api/v1/health", () => {
  it("200: reports the data source and defers db and intelligence", async () => {
    const response = await getHealth(request("/api/v1/health"));
    expect(response.status).toBe(200);
    const body = healthResponseSchema.parse(await response.json());
    expect(body).toMatchObject({ ok: true, dataSource: "fixtures", db: "skipped", intelligence: "skipped" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("200: an unusable DATA_SOURCE shows as ok: false instead of crashing", async () => {
    process.env["DATA_SOURCE"] = "nonsense";
    const body = healthResponseSchema.parse(await (await getHealth(request("/api/v1/health"))).json());
    expect(body.ok).toBe(false);
  });
});

describe("request ids", () => {
  it("echoes the id proxy.ts set", async () => {
    const response = await listTemplates(request("/api/v1/templates", { "x-request-id": "abc-123" }));
    expect(response.headers.get("x-request-id")).toBe("abc-123");
  });

  it.each([
    ["spaces and punctuation", "id with spaces, and commas"],
    ["over 64 characters", "a".repeat(65)],
  ])("issues a fresh id when the client sends one with %s", async (_name, supplied) => {
    const response = await getTemplate(request("/api/v1/templates/nope", { "x-request-id": supplied }), params("nope"));
    const body = errorBodySchema.parse(await response.json());
    expect(body.requestId).not.toBe(supplied);
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
