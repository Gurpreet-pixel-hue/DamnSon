import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clientIp, consume, ipHash, LIMITS_PER_MINUTE, resetRateLimits } from "./rateLimit";

beforeEach(() => resetRateLimits());
afterEach(() => resetRateLimits());

describe("consume (§10.1 limits)", () => {
  it("allows exactly the per-minute limit, then refuses with a retry hint", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < LIMITS_PER_MINUTE.search; i += 1) {
      expect(consume("search", "ip", now).ok).toBe(true);
    }
    const refused = consume("search", "ip", now);
    expect(refused.ok).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("refills over the window", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < LIMITS_PER_MINUTE.feedback; i += 1) consume("feedback", "ip", now);
    expect(consume("feedback", "ip", now).ok).toBe(false);
    expect(consume("feedback", "ip", now + 60_000).ok).toBe(true);
  });

  it("counts each bucket and each client separately", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < LIMITS_PER_MINUTE.copilot; i += 1) consume("copilot", "a", now);
    expect(consume("copilot", "a", now).ok).toBe(false);
    expect(consume("copilot", "b", now).ok).toBe(true);
    expect(consume("search", "a", now).ok).toBe(true);
  });
});

describe("ipHash (§12.1)", () => {
  it("never contains the address and rotates daily", () => {
    process.env["IP_HASH_SALT"] = "salt";
    const today = ipHash("203.0.113.7", new Date("2026-09-27T10:00:00Z"));
    const later = ipHash("203.0.113.7", new Date("2026-09-27T23:59:00Z"));
    const tomorrow = ipHash("203.0.113.7", new Date("2026-09-28T00:01:00Z"));
    expect(today).toMatch(/^[0-9a-f]{64}$/);
    expect(today).not.toContain("203.0.113");
    expect(later).toBe(today);
    expect(tomorrow).not.toBe(today);
  });

  it("separates different clients", () => {
    process.env["IP_HASH_SALT"] = "salt";
    expect(ipHash("203.0.113.7")).not.toBe(ipHash("203.0.113.8"));
  });
});

describe("clientIp", () => {
  it("takes the first entry of x-forwarded-for", () => {
    const request = new Request("http://localhost/", { headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" } });
    expect(clientIp(request)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to a shared bucket", () => {
    expect(clientIp(new Request("http://localhost/", { headers: { "x-real-ip": "198.51.100.2" } }))).toBe("198.51.100.2");
    expect(clientIp(new Request("http://localhost/"))).toBe("unknown");
  });
});
