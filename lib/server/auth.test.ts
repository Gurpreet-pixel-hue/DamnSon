import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorBodySchema } from "@/lib/contract/api";

const getClaims = vi.fn();
vi.mock("./supabase", () => ({
  getServerSupabase: (): unknown => Promise.resolve({ auth: { getClaims } }),
}));

const { requireAdmin, ADMIN_HEADERS } = await import("./auth");

beforeEach(() => {
  getClaims.mockReset();
});

const claims = (payload: unknown): void => {
  getClaims.mockResolvedValue({ data: { claims: payload }, error: null });
};

describe("requireAdmin (§10.2)", () => {
  it("401 when there is no session", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    const guard = await requireAdmin("req-1");
    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.response.status).toBe(401);
    expect(errorBodySchema.parse(await guard.response.json()).error.code).toBe("unauthorized");
  });

  it("401 when the token could not be verified", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "bad signature" } });
    const guard = await requireAdmin("req-2");
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
  });

  it("401 when the claims are not the shape we expect", async () => {
    claims({ no_subject: true });
    const guard = await requireAdmin("req-3");
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
  });

  it("401 rather than a crash when Supabase is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getClaims.mockRejectedValue(new Error("network down"));
    const guard = await requireAdmin("req-4");
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
  });

  it("403 for a signed-in account without the role", async () => {
    claims({ sub: "8eb190c5-91a8-429b-b482-49b86688c355", app_metadata: {} });
    const guard = await requireAdmin("req-5");
    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.response.status).toBe(403);
    expect(errorBodySchema.parse(await guard.response.json()).error.code).toBe("forbidden");
  });

  it("403 when the role is anything other than admin, so a made-up role cannot pass", async () => {
    claims({ sub: "u", app_metadata: { cw_role: "super_admin_lol" } });
    const guard = await requireAdmin("req-6");
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(403);
  });

  it("returns the user id for an admin", async () => {
    claims({ sub: "ba743406-564a-4fd9-8026-ae42f2e3862a", app_metadata: { cw_role: "admin" } });
    const guard = await requireAdmin("req-7");
    expect(guard).toEqual({ ok: true, userId: "ba743406-564a-4fd9-8026-ae42f2e3862a" });
  });

  it("never lets an admin response be cached", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    const guard = await requireAdmin("req-8");
    if (guard.ok) throw new Error("expected a refusal");
    expect(guard.response.headers.get("cache-control")).toBe("private, no-store");
    expect(ADMIN_HEADERS["cache-control"]).toBe("private, no-store");
  });
});
