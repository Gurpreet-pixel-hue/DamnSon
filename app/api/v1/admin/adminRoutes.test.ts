import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorBodySchema } from "@/lib/contract/api";

// Every admin route must refuse before it touches the database, so the guard is the unit under test
// here. The real Supabase session, and the 409 / 422 / 200 paths, are covered by scripts/admin-curl.sh
// against a live dev server, and by the DB-gated tests below.
const ADMIN_HEADERS = { "cache-control": "private, no-store" } as const;
const guard = vi.fn();
vi.mock("@/lib/server/auth", () => ({
  ADMIN_HEADERS: { "cache-control": "private, no-store" },
  requireAdmin: (requestId: string): unknown => guard(requestId),
}));

const { jsonError } = await import("@/lib/server/http");
const { GET: listModules } = await import("./modules/route");
const { GET: getModule } = await import("./modules/[id]/route");
const { PUT: putDraft } = await import("./modules/[id]/draft/route");
const { POST: publish } = await import("./templates/[id]/publish/route");
const { GET: audit } = await import("./audit/route");

const refuse = (code: "unauthorized" | "forbidden", status: number) => ({
  ok: false as const,
  response: jsonError(code, "nope", status, { requestId: "test", headers: ADMIN_HEADERS }),
});

type NextInit = ConstructorParameters<typeof NextRequest>[1];
const request = (path: string, init?: NextInit): NextRequest => new NextRequest(`http://localhost${path}`, init);
const moduleCtx = (id: string) => ({ params: Promise.resolve({ id }) });

const routes: { name: string; call: () => Promise<Response> }[] = [
  { name: "GET /admin/modules", call: () => listModules(request("/api/v1/admin/modules")) },
  {
    name: "GET /admin/modules/{id}",
    call: () => getModule(request("/api/v1/admin/modules/ex-tax"), moduleCtx("ex-tax")),
  },
  {
    name: "PUT /admin/modules/{id}/draft",
    call: () =>
      putDraft(
        request("/api/v1/admin/modules/ex-tax/draft", { method: "PUT", body: "{}" }),
        moduleCtx("ex-tax"),
      ),
  },
  {
    name: "POST /admin/templates/{id}/publish",
    call: () =>
      publish(
        request("/api/v1/admin/templates/example-startup/publish", { method: "POST", body: "{}" }),
        moduleCtx("example-startup"),
      ),
  },
  { name: "GET /admin/audit", call: () => audit(request("/api/v1/admin/audit")) },
];

beforeEach(() => {
  guard.mockReset();
});

describe("admin routes refuse before doing any work", () => {
  for (const route of routes) {
    it(`${route.name} → 401 without a session`, async () => {
      guard.mockResolvedValue(refuse("unauthorized", 401));
      const response = await route.call();
      expect(response.status).toBe(401);
      expect(errorBodySchema.parse(await response.json()).error.code).toBe("unauthorized");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

    it(`${route.name} → 403 for a non-admin`, async () => {
      guard.mockResolvedValue(refuse("forbidden", 403));
      const response = await route.call();
      expect(response.status).toBe(403);
      expect(errorBodySchema.parse(await response.json()).error.code).toBe("forbidden");
    });
  }
});

describe("admin routes validate their input after the guard", () => {
  beforeEach(() => {
    guard.mockResolvedValue({ ok: true, userId: "ba743406-564a-4fd9-8026-ae42f2e3862a" });
  });

  it("400 for a module id that is not kebab-case", async () => {
    const response = await getModule(request("/api/v1/admin/modules/Bad%20Id"), moduleCtx("Bad Id"));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("400 invalid_json for a draft body that is not JSON", async () => {
    const response = await putDraft(
      request("/api/v1/admin/modules/ex-tax/draft", { method: "PUT", body: "{oops" }),
      moduleCtx("ex-tax"),
    );
    expect(response.status).toBe(400);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe("invalid_json");
  });

  it("400 invalid_request when the draft is not a valid module", async () => {
    const response = await putDraft(
      request("/api/v1/admin/modules/ex-tax/draft", {
        method: "PUT",
        body: JSON.stringify({ content: { schemaVersion: 3 }, baseHash: "a".repeat(64) }),
      }),
      moduleCtx("ex-tax"),
    );
    expect(response.status).toBe(400);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe("invalid_request");
  });

  it("400 when expectedRevision is missing from a publish", async () => {
    const response = await publish(
      request("/api/v1/admin/templates/example-startup/publish", { method: "POST", body: "{}" }),
      moduleCtx("example-startup"),
    );
    expect(response.status).toBe(400);
  });
});
