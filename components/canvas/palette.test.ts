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
      "--cw-border": "border",
      "--cw-text": "text",
      "--cw-text-muted": "textMuted",
      "--cw-available": "available",
      "--cw-done": "done",
      "--cw-locked": "locked",
      "--cw-undecided": "undecided",
      "--cw-error": "error",
      "--cw-critical": "critical",
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
    expect(PALETTE.ground).toBe("#0c0c0f");
    expect(PALETTE.stationBase).toBe("#3f3f46");
    expect(PALETTE.normalTrack).toBe("#3f3f46");
  });
});
