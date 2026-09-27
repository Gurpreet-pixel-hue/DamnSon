import { afterEach, describe, expect, it } from "vitest";
import { serviceAuthorizationHeader, signServiceToken } from "./serviceToken";

// PRD §6.5: the AI service ships the same vector, so a mismatch here means the two sides disagree.
const SECRET = "test-secret";
const EXP = 1790000000;
const SIGNATURE = "b4255b18f777d9eade30fb7a1ad05b14a03ce3692f9b55248f99fd4caf629c64";

const previous = process.env["INTERNAL_SERVICE_SECRET"];
afterEach(() => {
  if (previous === undefined) delete process.env["INTERNAL_SERVICE_SECRET"];
  else process.env["INTERNAL_SERVICE_SECRET"] = previous;
});

describe("signServiceToken (§6.5)", () => {
  it("matches the vector shared with the AI service", () => {
    expect(signServiceToken(SECRET, EXP)).toBe(`${EXP}.${SIGNATURE}`);
  });

  it("changes with the secret and with exp", () => {
    expect(signServiceToken("other-secret", EXP)).not.toBe(`${EXP}.${SIGNATURE}`);
    expect(signServiceToken(SECRET, EXP + 1)).not.toBe(`${EXP}.${SIGNATURE}`);
  });
});

describe("serviceAuthorizationHeader", () => {
  it("expires 60 seconds ahead, inside the service's 120-second window", () => {
    process.env["INTERNAL_SERVICE_SECRET"] = SECRET;
    const header = serviceAuthorizationHeader(EXP * 1000);
    expect(header).toBe(`Bearer ${signServiceToken(SECRET, EXP + 60)}`);
  });

  it("refuses to send an unsigned request when the secret is missing", () => {
    delete process.env["INTERNAL_SERVICE_SECRET"];
    expect(() => serviceAuthorizationHeader()).toThrow(/INTERNAL_SERVICE_SECRET/);
  });
});
