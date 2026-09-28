import { expect, test } from "@playwright/test";

/**
 * The public API surface end to end (PL-7, §10.1, Appendix F).
 *
 * This runs against whatever BASE_URL points at, so the same spec covers a local dev server and a
 * deployment. It asserts the contract a citizen's browser depends on: real seed data is served, errors
 * use the envelope, and nothing leaks.
 */
test.describe("GET /api/v1/health", () => {
  test("reports liveness and which data source is in use", async ({ request }) => {
    const response = await request.get("/api/v1/health");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { ok: boolean; dataSource: string; db: string; intelligence: string };
    expect(body.ok).toBe(true);
    expect(["files", "db", "fixtures"]).toContain(body.dataSource);
    expect(["up", "down", "skipped"]).toContain(body.db);
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
});

test.describe("GET /api/v1/templates", () => {
  test("serves the verified civic journeys, not fixtures", async ({ request }) => {
    const response = await request.get("/api/v1/templates");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { templates: { taskId: string; stepCount: number; verifiedStepCount: number }[] };

    const ids = body.templates.map((t) => t.taskId);
    expect(ids).toContain("start-business-mumbai");
    // Nothing synthetic may reach a citizen (§9.1).
    expect(ids.filter((id) => id.startsWith("ex-") || id.includes("synthetic"))).toEqual([]);

    const demo = body.templates.find((t) => t.taskId === "start-business-mumbai");
    expect(demo?.stepCount).toBeGreaterThan(10);
    // CP1 asks for at least five verified modules on the demo path.
    expect(demo?.verifiedStepCount).toBeGreaterThanOrEqual(5);
  });

  test("filters by city and by query", async ({ request }) => {
    const mumbai = await (await request.get("/api/v1/templates?city=Mumbai")).json();
    expect((mumbai as { templates: unknown[] }).templates.length).toBeGreaterThan(0);
    const elsewhere = await (await request.get("/api/v1/templates?city=Chennai")).json();
    expect((elsewhere as { templates: unknown[] }).templates).toEqual([]);
  });

  test("400 on an over-long query, with the error envelope", async ({ request }) => {
    const response = await request.get(`/api/v1/templates?q=${"a".repeat(400)}`);
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string }; requestId: string };
    expect(body.error.code).toBe("invalid_request");
    expect(body.requestId).toMatch(/^[A-Za-z0-9-]+$/);
    // No stack traces, ever (§12.1).
    expect(JSON.stringify(body)).not.toContain("at Object");
    expect(JSON.stringify(body)).not.toContain("node_modules");
  });
});

test.describe("GET /api/v1/templates/{taskId}", () => {
  test("returns the template with exactly its pinned modules", async ({ request }) => {
    const response = await request.get("/api/v1/templates/start-business-mumbai");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      template: { taskId: string; modules: unknown[] };
      modules: unknown[];
      publishedAt: string;
    };
    expect(body.template.taskId).toBe("start-business-mumbai");
    expect(body.modules).toHaveLength(body.template.modules.length);
    expect(Date.parse(body.publishedAt)).not.toBeNaN();
  });

  test("404 for a journey that is not published", async ({ request }) => {
    const response = await request.get("/api/v1/templates/no-such-journey");
    expect(response.status()).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("not_found");
  });

  test("400 for an id that is not kebab-case", async ({ request }) => {
    const response = await request.get("/api/v1/templates/Not%20An%20Id");
    expect(response.status()).toBe(400);
  });
});

test.describe("the admin API is closed to the public", () => {
  for (const path of ["/api/v1/admin/modules", "/api/v1/admin/audit"]) {
    test(`401 on ${path} without a session`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(401);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("unauthorized");
      expect(response.headers()["cache-control"]).toContain("no-store");
    });
  }
});

test.describe("security headers (§12.1)", () => {
  test("are present on a page response", async ({ request }) => {
    const headers = (await request.get("/")).headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["x-request-id"]).toBeTruthy();
  });
});
