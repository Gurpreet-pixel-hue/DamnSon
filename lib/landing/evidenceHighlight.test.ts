import { describe, it, expect } from "vitest";
import { highlightEvidence, mergeRanges } from "./evidenceHighlight";

describe("evidenceHighlight", () => {
  it("merges overlapping and adjacent ranges", () => {
    const ranges = [
      { start: 0, end: 5 },
      { start: 3, end: 8 },
      { start: 10, end: 12 },
      { start: 12, end: 15 },
    ];
    expect(mergeRanges(ranges)).toEqual([
      { start: 0, end: 8 },
      { start: 10, end: 15 },
    ]);
  });

  it("handles case-insensitive match", () => {
    const text = "I want to open a Cloud Kitchen in Andheri";
    const segments = highlightEvidence(text, ["cloud kitchen"]);
    expect(segments).toEqual([
      { text: "I want to open a ", highlighted: false },
      { text: "Cloud Kitchen", highlighted: true },
      { text: " in Andheri", highlighted: false },
    ]);
  });

  it("handles multiple evidence phrases and overlaps", () => {
    const text = "Open a cloud kitchen with 5 employees";
    const segments = highlightEvidence(text, ["cloud kitchen", "kitchen with", "5 employees"]);
    expect(segments).toEqual([
      { text: "Open a ", highlighted: false },
      { text: "cloud kitchen with", highlighted: true },
      { text: " ", highlighted: false },
      { text: "5 employees", highlighted: true },
    ]);
  });

  it("is Devanagari and Unicode safe", () => {
    const text = "मला अंधेरी मध्ये नवीन उपहारगृह सुरू करायचे आहे";
    const segments = highlightEvidence(text, ["उपहारगृह", "अंधेरी"]);
    expect(segments).toEqual([
      { text: "मला ", highlighted: false },
      { text: "अंधेरी", highlighted: true },
      { text: " मध्ये नवीन ", highlighted: false },
      { text: "उपहारगृह", highlighted: true },
      { text: " सुरू करायचे आहे", highlighted: false },
    ]);
  });

  it("returns unhighlighted text if evidence is empty or null", () => {
    const text = "Some query";
    expect(highlightEvidence(text, [])).toEqual([{ text: "Some query", highlighted: false }]);
    expect(highlightEvidence(text, [null, undefined, ""])).toEqual([{ text: "Some query", highlighted: false }]);
  });
});
