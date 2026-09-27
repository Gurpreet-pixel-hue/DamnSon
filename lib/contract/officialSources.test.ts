import { describe, expect, it } from "vitest";
import { isOfficialUrl, VETTED_OFFICIAL_HOSTS } from "./officialSources";

// PRD App. D.6: "official" is https on .gov.in / .nic.in, or a manually vetted host. Never a bare ".gov" check.
const CASES: readonly (readonly [string, boolean])[] = [
  ["https://portal.mcgm.gov.in/", true],
  ["https://www.mca.gov.in/", true],
  ["https://example.nic.in/x", true],
  ["http://portal.mcgm.gov.in/", false],
  ["https://gov.in.evil.com/", false],
  ["https://evilgov.in/", false],
  ["https://example.com/", false],
  ["https://gov.in/", false],
  ["not a url", false],
];

describe("isOfficialUrl (App. D.6)", () => {
  for (const [url, expected] of CASES) {
    it(`${JSON.stringify(url)} is ${expected ? "official" : "not official"}`, () => {
      expect(isOfficialUrl(url)).toBe(expected);
    });
  }

  it("starts with an empty vetted-host list", () => {
    expect(VETTED_OFFICIAL_HOSTS).toEqual([]);
  });
});
