import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorBodySchema, searchResponseSchema } from "@/lib/contract/api";
import { LIMITS_PER_MINUTE, resetRateLimits } from "@/lib/server/rateLimit";
import { signServiceToken } from "@/lib/server/serviceToken";
import { POST as search } from "./search/route";

const SECRET = "test-secret";

// A stub intelligence service over real HTTP, so the Authorization header, the timeout and the F.3
// reply shape are exercised for real rather than mocked away.
let server: Server;
let baseUrl: string;
let reply: { status: number; body: unknown } = { status: 200, body: null };
let lastAuthorization: string | null = null;
let lastBody: unknown = null;

beforeAll(async () => {
  server = createServer((request: IncomingMessage, response: ServerResponse) => {
    lastAuthorization = request.headers.authorization ?? null;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      lastBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
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
  process.env["INTERNAL_SERVICE_SECRET"] = SECRET;
  process.env["IP_HASH_SALT"] = "test-salt";
  delete process.env["INTELLIGENCE_BASE_URL"];
  lastAuthorization = null;
  lastBody = null;
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...saved };
});

let ipCounter = 0;
const post = (body: unknown, raw?: string): NextRequest => {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/v1/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${ipCounter % 250}` },
    body: raw ?? JSON.stringify(body),
  });
};

const AI_REPLY = {
  facts: [
    { fact: "company.founders_count", value: 2, evidence: "two founders" },
    { fact: "employees.count", value: 5, evidence: "five employees" },
  ],
  jurisdiction: { state: "Maharashtra", city: "Mumbai", matchedText: "Mumbai" },
  matches: [{ taskId: "example-startup", score: 0.93 }],
  clarifications: [],
};

describe("POST /api/v1/search — validation", () => {
  it("400 invalid_json for a body that is not JSON", async () => {
    const response = await search(post(null, "{not json"));
    expect(response.status).toBe(400);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe("invalid_json");
  });

  it("400 before parsing, for a body over the size cap (#10 review)", async () => {
    const { MAX_BODY_BYTES } = await import("@/lib/server/http");
    const response = await search(post(null, JSON.stringify({ query: "x".repeat(MAX_BODY_BYTES + 50) })));
    expect(response.status).toBe(400);
    const body = errorBodySchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toBe("The request body is too large.");
  });

  it("400 invalid_request for a query that is too short, naming the field but not the query", async () => {
    const response = await search(post({ query: "hi" }));
    expect(response.status).toBe(400);
    const body = errorBodySchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_request");
    expect(JSON.stringify(body)).toContain("query");
    expect(JSON.stringify(body)).not.toContain("hi\"");
  });

  it("429 once the per-minute limit is used up, with Retry-After", async () => {
    const ip = "203.0.113.9";
    const send = (): Promise<Response> =>
      search(
        new NextRequest("http://localhost/api/v1/search", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ query: "start a company in Mumbai" }),
        }),
      );
    for (let i = 0; i < LIMITS_PER_MINUTE.search; i += 1) expect((await send()).status).toBe(200);
    const refused = await send();
    expect(refused.status).toBe(429);
    expect(errorBodySchema.parse(await refused.json()).error.code).toBe("rate_limited");
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });
});

describe("POST /api/v1/search — lexical fallback (§6.6)", () => {
  it("falls back when INTELLIGENCE_BASE_URL is unset", async () => {
    const response = await search(post({ query: "example synthetic test" }));
    expect(response.status).toBe(200);
    const body = searchResponseSchema.parse(await response.json());
    expect(body.mode).toBe("lexical_fallback");
    expect(body.facts).toEqual([]);
    expect(body.jurisdiction).toBeNull();
    expect(body.clarifications).toEqual([]);
    expect(body.matches.map((m) => m.taskId)).toContain("example-startup");
    expect(body.matches[0]?.score).toBeLessThanOrEqual(1);
  });

  it("reports no_match when nothing scores", async () => {
    const body = searchResponseSchema.parse(await (await search(post({ query: "zzzzzz qqqqqq" }))).json());
    expect(body.mode).toBe("lexical_fallback");
    expect(body.matches).toEqual([]);
    expect(body.notice).toBe("no_match");
  });

  it("falls back when the service errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env["INTELLIGENCE_BASE_URL"] = baseUrl;
    reply = { status: 500, body: { detail: "boom" } };
    const body = searchResponseSchema.parse(await (await search(post({ query: "example synthetic" }))).json());
    expect(body.mode).toBe("lexical_fallback");
  });

  it("falls back when the reply does not match F.3", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env["INTELLIGENCE_BASE_URL"] = baseUrl;
    reply = { status: 200, body: { matches: "not an array" } };
    const body = searchResponseSchema.parse(await (await search(post({ query: "example synthetic" }))).json());
    expect(body.mode).toBe("lexical_fallback");
  });
});

describe("POST /api/v1/search — ai mode", () => {
  beforeEach(() => {
    process.env["INTELLIGENCE_BASE_URL"] = baseUrl;
    reply = { status: 200, body: AI_REPLY };
  });

  it("sends a valid service token and the candidate summaries", async () => {
    await search(post({ query: "start a SaaS company in Mumbai with two founders" }));
    const [scheme, token] = (lastAuthorization ?? "").split(" ");
    expect(scheme).toBe("Bearer");
    const [exp, signature] = (token ?? "").split(".");
    expect(signServiceToken(SECRET, Number(exp))).toBe(`${exp}.${signature}`);
    // The window is now..now+120 on the service side, so a 60-second token must still be in the future.
    expect(Number(exp)).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const sent: unknown = lastBody;
    expect(sent).toMatchObject({ query: "start a SaaS company in Mumbai with two founders", locale: "en" });
    expect(Array.isArray((sent as { candidates?: unknown[] }).candidates)).toBe(true);
  });

  it("attaches the published summary to each match", async () => {
    const body = searchResponseSchema.parse(await (await search(post({ query: "start a company in Mumbai" }))).json());
    expect(body.mode).toBe("ai");
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0]).toMatchObject({ taskId: "example-startup", score: 0.93, stepCount: 9 });
    expect(body.jurisdiction).toEqual({ state: "Maharashtra", city: "Mumbai", matchedText: "Mumbai" });
  });

  it("drops a match for a template we do not publish", async () => {
    reply = {
      status: 200,
      body: { ...AI_REPLY, matches: [{ taskId: "invented-journey", score: 0.99 }, { taskId: "example-startup", score: 0.5 }] },
    };
    const body = searchResponseSchema.parse(await (await search(post({ query: "start a company" }))).json());
    expect(body.matches.map((m) => m.taskId)).toEqual(["example-startup"]);
  });

  it("reports no_match when every match was unpublished", async () => {
    reply = { status: 200, body: { ...AI_REPLY, matches: [{ taskId: "invented-journey", score: 0.99 }] } };
    const body = searchResponseSchema.parse(await (await search(post({ query: "start a company" }))).json());
    expect(body.matches).toEqual([]);
    expect(body.notice).toBe("no_match");
  });

  it("drops facts the registry rejects and keeps the valid ones", async () => {
    reply = {
      status: 200,
      body: {
        ...AI_REPLY,
        facts: [
          { fact: "company.founders_count", value: 2, evidence: "two founders" },
          { fact: "employees.count", value: -5, evidence: "minus five" },
          { fact: "business.sector", value: "underwater_basket_weaving", evidence: "baskets" },
          { fact: "business.serves_food", value: "maybe", evidence: "maybe food" },
        ],
      },
    };
    const body = searchResponseSchema.parse(await (await search(post({ query: "start a company" }))).json());
    expect(body.facts.map((f) => f.fact)).toEqual(["company.founders_count"]);
  });

  it("keeps the notice the service sent", async () => {
    reply = { status: 200, body: { ...AI_REPLY, matches: [], notice: "location_required" } };
    const body = searchResponseSchema.parse(await (await search(post({ query: "register a business" }))).json());
    expect(body.notice).toBe("location_required");
  });
});
