import { describe, expect, it } from "vitest";
import { errorBodySchema } from "@/lib/contract/api";
import { MAX_ADMIN_BODY_BYTES, MAX_BODY_BYTES, readJsonBody, requestId } from "./http";

const post = (body: BodyInit, headers: Record<string, string> = {}): Request =>
  new Request("http://localhost/api/v1/search", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

describe("readJsonBody size cap (#10 review)", () => {
  it("accepts a normal body", async () => {
    const result = await readJsonBody(post(JSON.stringify({ query: "start a company" })), { requestId: "r" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ query: "start a company" });
  });

  it("refuses an oversized body declared by content-length, before parsing it", async () => {
    const oversized = JSON.stringify({ query: "x".repeat(MAX_BODY_BYTES + 100) });
    const result = await readJsonBody(post(oversized), { requestId: "r" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    const body = errorBodySchema.parse(await result.response.json());
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toBe("The request body is too large.");
  });

  it("refuses an oversized body that declares no content-length, by capping the stream", async () => {
    // A chunked upload: content-length is absent, so only the streaming cap can stop it.
    const chunk = new TextEncoder().encode("y".repeat(4096));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_BODY_BYTES * 2) {
          controller.close();
          return;
        }
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const request = new Request("http://localhost/api/v1/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      // @ts-expect-error duplex is required for a streaming body and is not in the DOM lib types yet
      duplex: "half",
    });
    const result = await readJsonBody(request, { requestId: "r" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("gives the admin cap real headroom, because a module is much larger than a query", async () => {
    // The MCGM water-connection module is ~26 KB at 11 steps and the schema allows 20.
    expect(MAX_ADMIN_BODY_BYTES).toBeGreaterThan(26 * 1024 * 2);
    const big = JSON.stringify({ content: { pad: "z".repeat(60 * 1024) }, baseHash: "a".repeat(64) });
    const result = await readJsonBody(post(big), { requestId: "r", maxBytes: MAX_ADMIN_BODY_BYTES });
    expect(result.ok).toBe(true);
  });

  it("still reports malformed JSON as invalid_json", async () => {
    const result = await readJsonBody(post("{nope"), { requestId: "r" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(errorBodySchema.parse(await result.response.json()).error.code).toBe("invalid_json");
  });

  it("carries the caller's headers onto the refusal, so admin responses stay uncacheable", async () => {
    const result = await readJsonBody(post("{nope"), { requestId: "r", headers: { "cache-control": "private, no-store" } });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("requestId", () => {
  it("issues a uuid when nothing usable arrives", () => {
    expect(requestId(new Request("http://localhost/"))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
