import { describe, it, expect } from "vitest";
import raw from "@/data/offices/mcgm-ward-water-offices.json";
import waterModule from "@/data/seed/modules/mcgm-new-water-connection.json";
import { WARD_OFFICES, mapsSearchUrl, wardOfficeSchema, wardOfficesFileSchema } from "./wardOffices";

const valid = {
  ward: "D",
  office: "Assistant Engineer (Water Works), D Ward",
  address: "1st Floor, D Ward Building, Nana Chowk, Mumbai – 400 007.",
  source: {
    url: "https://portal.mcgm.gov.in/manual.pdf",
    title: "Section 4 manual",
    retrievedOn: "2026-09-28",
  },
};

describe("ward office dataset", () => {
  it("parses the committed file", () => {
    const result = wardOfficesFileSchema.safeParse(raw);
    expect(result.success).toBe(true);
    expect(WARD_OFFICES.map((o) => o.ward)).toEqual(["A", "D", "H/East", "K/West", "L", "P/South", "R/Central"]);
  });

  it("cites only manuals the water connection journey also cites", () => {
    const seedUrls = new Set(waterModule.sources.map((s) => s.url));
    for (const office of WARD_OFFICES) expect(seedUrls.has(office.source.url), office.ward).toBe(true);
  });
});

describe("wardOfficeSchema", () => {
  it("accepts an office without hours or a map check", () => {
    expect(wardOfficeSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a source that is not an official page", () => {
    const bad = { ...valid, source: { ...valid.source, url: "https://example.com/manual.pdf" } };
    expect(wardOfficeSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown fields such as invented coordinates", () => {
    expect(wardOfficeSchema.safeParse({ ...valid, lat: 18.96 }).success).toBe(false);
  });

  it("rejects a malformed map check date", () => {
    expect(wardOfficeSchema.safeParse({ ...valid, mapCheckedOn: "yesterday" }).success).toBe(false);
  });

  it("rejects a file that lists a ward twice", () => {
    expect(wardOfficesFileSchema.safeParse({ about: "Ward offices file", offices: [valid, valid] }).success).toBe(false);
  });
});

describe("mapsSearchUrl", () => {
  it("encodes the verbatim address as the search query", () => {
    const url = new URL(mapsSearchUrl("‘D’ Ward, Grant Road (West), Mumbai – 400 007"));
    expect(url.hostname).toBe("www.google.com");
    expect(url.searchParams.get("query")).toBe("‘D’ Ward, Grant Road (West), Mumbai – 400 007");
  });
});
