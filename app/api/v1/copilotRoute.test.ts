import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { copilotResponseSchema, errorBodySchema } from "@/lib/contract/api";
import { LIMITS_PER_MINUTE, resetRateLimits } from "@/lib/server/rateLimit";
import { POST as copilot } from "./copilot/route";

// Stub intelligence service on a real socket, as in searchRoute.test.ts.
let server: Server;
let baseUrl: string;
let reply: { status: number; body: unknown } = { status: 200, body: null };
let lastBody: Record<string, unknown> = {};

beforeAll(async () => {
  server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      lastBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      response.writeHead(reply.status, { "content-type": "application/json" });
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("could not start the stub service");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
});

const saved = { ...process.env };
beforeEach(() => {
  resetRateLimits();
  process.env["DATA_SOURCE"] = "fixtures";
  process.env["INTERNAL_SERVICE_SECRET"] = "test-secret";
  process.env["IP_HASH_SALT"] = "test-salt";
  process.env["INTELLIGENCE_BASE_URL"] = baseUrl;
  lastBody = {};
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...saved };
});

let ipCounter = 0;
const post = (body: unknown, raw?: string): NextRequest => {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/v1/copilot", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${ipCounter % 250}` },
    body: raw ?? JSON.stringify(body),
  });
};

const CHUNK = "3f1a5d6e-8b2c-4a7f-9e1d-2c4b6a8e0f13";
const ANSWER = {
  answer: "You file the incorporation form on the portal [1].",
  language: "en",
  citations: [
    { n: 1, url: "https://www.india.gov.in/", title: "National Portal of India", quote: "Submit the integrated form", chunkId: CHUNK },
  ],
};

describe("POST /api/v1/copilot — validation and limits", () => {
  it("400 invalid_json", async () => {
    const response = await copilot(post(null, "{nope"));
    expect(response.status).toBe(400);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe("invalid_json");
  });

  it("400 invalid_request for a question that is too short, without echoing it", async () => {
    const response = await copilot(post({ question: "hi" }));
    expect(response.status).toBe(400);
    const body = errorBodySchema.parse(await response.json());
    expect(JSON.stringify(body)).toContain("question");
    expect(JSON.stringify(body)).not.toContain('"hi"');
  });

  it("429 after the per-minute limit, with Retry-After", async () => {
    const ip = "192.0.2.240";
    const send = (): Promise<Response> =>
      copilot(
        new NextRequest("http://localhost/api/v1/copilot", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ question: "What documents do I need?" }),
        }),
      );
    reply = { status: 200, body: ANSWER };
    for (let i = 0; i < LIMITS_PER_MINUTE.copilot; i += 1) expect((await send()).status).toBe(200);
    const refused = await send();
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });

  it("404 for a journey that is not published", async () => {
    reply = { status: 200, body: ANSWER };
    const response = await copilot(post({ question: "What documents do I need?", taskId: "no-such-journey" }));
    expect(response.status).toBe(404);
  });
});

describe("POST /api/v1/copilot — the service is unavailable (§6.6)", () => {
  it("503 when INTELLIGENCE_BASE_URL is unset", async () => {
    delete process.env["INTELLIGENCE_BASE_URL"];
    const response = await copilot(post({ question: "What documents do I need?" }));
    expect(response.status).toBe(503);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe("upstream_unavailable");
  });

  it("503 when the service errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    reply = { status: 500, body: { detail: "boom" } };
    expect((await copilot(post({ question: "What documents do I need?" }))).status).toBe(503);
  });

  it("503 when the reply does not match F.3", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    reply = { status: 200, body: { answer: "yes", citations: "not an array" } };
    expect((await copilot(post({ question: "What documents do I need?" }))).status).toBe(503);
  });
});

describe("POST /api/v1/copilot — scope", () => {
  beforeEach(() => {
    reply = { status: 200, body: ANSWER };
  });

  it("sends the journey's official sources and its jurisdiction", async () => {
    await copilot(post({ question: "What documents do I need?", taskId: "example-startup" }));
    expect(lastBody["jurisdiction"]).toEqual({ state: "Maharashtra", city: "Mumbai" });
    const urls = lastBody["scopeUrls"];
    expect(Array.isArray(urls)).toBe(true);
    expect(urls).toContain("https://www.india.gov.in/");
    expect(lastBody["stepTitle"]).toBeUndefined();
  });

  it("narrows to one step's sources, and names the step", async () => {
    await copilot(post({ question: "What documents do I need?", taskId: "example-startup", stepId: "ex-incorporation.file" }));
    expect(lastBody["scopeUrls"]).toEqual(["https://www.india.gov.in/", "https://example.com/unofficial-guide"]);
    expect(lastBody["stepTitle"]).toBe("File the incorporation form");
  });

  it("sends no scope at all without a taskId", async () => {
    await copilot(post({ question: "What documents do I need?" }));
    expect(lastBody["scopeUrls"]).toBeUndefined();
    expect(lastBody["jurisdiction"]).toBeUndefined();
  });
});

describe("POST /api/v1/copilot — answers", () => {
  it("returns a cited answer that satisfies the contract", async () => {
    reply = { status: 200, body: ANSWER };
    const response = await copilot(post({ question: "What documents do I need?", taskId: "example-startup" }));
    expect(response.status).toBe(200);
    const body = copilotResponseSchema.parse(await response.json());
    expect(body.answer).toContain("[1]");
    expect(body.citations).toHaveLength(1);
    expect(body.citations[0]?.official).toBe(true);
  });

  it("drops a non-official citation however the service labels it (§13.1)", async () => {
    reply = {
      status: 200,
      body: {
        ...ANSWER,
        citations: [
          { n: 1, url: "https://example.com/unofficial-guide", title: "A blog", quote: "some text", chunkId: CHUNK, official: true },
        ],
      },
    };
    const body = copilotResponseSchema.parse(await (await copilot(post({ question: "What is the fee?" }))).json());
    expect(body.citations).toEqual([]);
    expect(body.answer).toBeNull();
    expect(body.notice).toBe("not_found");
  });

  it("keeps the official citations but withholds the prose when one was dropped", async () => {
    reply = {
      status: 200,
      body: {
        ...ANSWER,
        answer: "Do A [1] and then B [2].",
        citations: [
          { n: 1, url: "https://www.india.gov.in/", title: "National Portal of India", quote: "Do A", chunkId: CHUNK },
          { n: 2, url: "https://example.com/blog", title: "A blog", quote: "Do B", chunkId: CHUNK },
        ],
      },
    };
    const body = copilotResponseSchema.parse(await (await copilot(post({ question: "What is the fee?" }))).json());
    // Keeping the prose would leave "[2]" pointing at nothing, and its claim unsupported.
    expect(body.citations.map((c) => c.n)).toEqual([1]);
    expect(body.answer).toBeNull();
    expect(body.notice).toBe("not_found");
  });

  it("refuses to pass on an answer with no citations", async () => {
    reply = { status: 200, body: { ...ANSWER, citations: [] } };
    const body = copilotResponseSchema.parse(await (await copilot(post({ question: "What is the fee?" }))).json());
    expect(body.answer).toBeNull();
    expect(body.notice).toBe("not_found");
  });

  it("passes through not_found with its passages", async () => {
    reply = {
      status: 200,
      body: {
        answer: null,
        language: "en",
        citations: [],
        notice: "not_found",
        passages: [{ url: "https://www.india.gov.in/", title: "National Portal of India", text: "Some official text" }],
      },
    };
    const body = copilotResponseSchema.parse(await (await copilot(post({ question: "What is the fee?" }))).json());
    expect(body.answer).toBeNull();
    expect(body.notice).toBe("not_found");
    expect(body.passages).toHaveLength(1);
  });

  it("passes through the degraded notice when no model was available", async () => {
    reply = { status: 200, body: { answer: null, language: "en", citations: [], notice: "degraded" } };
    const body = copilotResponseSchema.parse(await (await copilot(post({ question: "What is the fee?" }))).json());
    expect(body.notice).toBe("degraded");
  });
});
