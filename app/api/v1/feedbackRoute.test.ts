import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorBodySchema } from "@/lib/contract/api";
import { LIMITS_PER_MINUTE, resetRateLimits } from "@/lib/server/rateLimit";
import { POST as feedback } from "./feedback/route";

const saved = { ...process.env };
beforeEach(() => {
  resetRateLimits();
  process.env["IP_HASH_SALT"] = "test-salt";
  process.env["DATA_SOURCE"] = "files";
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...saved };
});

let ipCounter = 0;
const post = (body: unknown, raw?: string): NextRequest => {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/v1/feedback", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${ipCounter % 250}` },
    body: raw ?? JSON.stringify(body),
  });
};

describe("POST /api/v1/feedback", () => {
  it("400 invalid_json", async () => {
    const response = await feedback(post(null, "nope"));
    expect(response.status).toBe(400);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe("invalid_json");
  });

  it("400 invalid_request for an unknown kind", async () => {
    const response = await feedback(post({ kind: "vibes" }));
    expect(response.status).toBe(400);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe("invalid_request");
  });

  it("400 invalid_request for a message over 1000 characters", async () => {
    const response = await feedback(post({ kind: "other", message: "a".repeat(1001) }));
    expect(response.status).toBe(400);
  });

  it("503 upstream_unavailable when the data source is not the database", async () => {
    const response = await feedback(post({ kind: "broken_link", taskId: "example-startup" }));
    expect(response.status).toBe(503);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe("upstream_unavailable");
  });

  it("429 once the per-minute limit is used up", async () => {
    const ip = "203.0.113.44";
    const send = (): Promise<Response> =>
      feedback(
        new NextRequest("http://localhost/api/v1/feedback", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ kind: "outdated" }),
        }),
      );
    // The limit is checked before the data source, so these return 503 while tokens remain.
    for (let i = 0; i < LIMITS_PER_MINUTE.feedback; i += 1) expect((await send()).status).toBe(503);
    const refused = await send();
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });
});

// Only runs when a database is configured, like the other integration tests.
const hasDatabase = (process.env["DATABASE_URL"] ?? "").length > 0;
describe.skipIf(!hasDatabase)("POST /api/v1/feedback against a real database", () => {
  it("201 with an id, storing a hash rather than the IP", async () => {
    process.env["DATA_SOURCE"] = "db";
    const response = await feedback(post({ kind: "wrong_fee", taskId: "start-business-mumbai", message: "fee looks stale" }));
    expect(response.status).toBe(201);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ id: expect.stringMatching(/^[0-9a-f-]{36}$/) });

    const { getPrisma } = await import("@/lib/server/db/client");
    const row = await getPrisma().feedback.findFirst({ orderBy: { createdAt: "desc" } });
    expect(row?.kind).toBe("wrong_fee");
    expect(row?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.ipHash).not.toContain("198.51.100");
  });
});
