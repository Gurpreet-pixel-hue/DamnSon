import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PALETTE } from "./palette";

describe("palette tokens consistency with app/globals.css", () => {
  it("verifies every --cw-* token in globals.css matches PALETTE", () => {
    const cssPath = path.resolve(process.cwd(), "app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    // Tokens mapped between CSS (--cw-kebab) and PALETTE (camelCase)
    const tokenMapping: Record<string, keyof typeof PALETTE> = {
      "--cw-background": "background",
      "--cw-surface": "surface",
      "--cw-surface-muted": "surfaceMuted",
      "--cw-border": "border",
      "--cw-text": "text",
      "--cw-text-muted": "textMuted",
      "--cw-brand": "brand",
      "--cw-available": "available",
      "--cw-done": "done",
      "--cw-locked": "locked",
      "--cw-undecided": "undecided",
      "--cw-attention": "attention",
      "--cw-critical": "critical",
      "--cw-error": "error",
    };

    for (const [cssVar, paletteKey] of Object.entries(tokenMapping)) {
      const regex = new RegExp(`${cssVar}:\\s*([^;]+);`);
      const match = cssContent.match(regex);
      expect(
        match,
        `Expected ${cssVar} to be defined in app/globals.css`
      ).not.toBeNull();

      const cssHex = match![1]!.trim().toLowerCase();
      const paletteHex = PALETTE[paletteKey].toLowerCase();
      expect(
        cssHex,
        `CSS variable ${cssVar} (${cssHex}) must equal PALETTE.${paletteKey} (${paletteHex})`
      ).toBe(paletteHex);
    }
  });

  it("verifies scene-only colors exist in PALETTE", () => {
    expect(PALETTE.seaDeep).toBe("#4E97AE");
    expect(PALETTE.seaShallow).toBe("#8CC3D1");
    expect(PALETTE.land).toBe("#EADFC8");
    expect(PALETTE.park).toBe("#B7CF95");
    expect(PALETTE.road).toBe("#D6CCBA");
    expect(PALETTE.roadEdge).toBe("#C4B8A2");
    expect(PALETTE.plaza).toBe("#F2EBDD");
    expect(PALETTE.slabSide).toBe("#D9C9A8");
    expect(PALETTE.sky).toBe("#F3ECDF");
    expect(PALETTE.fog).toBe("#F3ECDF");
    expect(PALETTE.sun).toBe("#FFE6C0");
    expect(PALETTE.hemiSky).toBe("#FFF6E8");
    expect(PALETTE.hemiGround).toBe("#C9B794");
    expect(PALETTE.trackNormal).toBe("#9AA3AD");
  });
});
