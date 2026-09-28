import { describe, it, expect } from "vitest";
import { computeViewportInsets } from "./viewportInsets";

describe("computeViewportInsets (A2 & §11.8)", () => {
  it("computes default insets and centered free area when no overlays are open", () => {
    const res = computeViewportInsets({
      viewportWidth: 1440,
      viewportHeight: 900,
      isTrayOpen: false,
      isDrawerOpen: false,
    });

    expect(res.insets.left).toBe(24);
    expect(res.insets.right).toBe(24);
    expect(res.insets.top).toBe(56);
    expect(res.freeArea.left).toBe(24);
    expect(res.freeArea.right).toBe(1416);
    expect(res.freeArea.width).toBe(1392);
    expect(res.freeArea.centerX).toBe(720);
    expect(res.freeArea.maxBarWidth).toBe(1360);
  });

  it("shifts free area and centers stage bar to the right when parallel tray is open (300px + 16px)", () => {
    const res = computeViewportInsets({
      viewportWidth: 1440,
      viewportHeight: 900,
      isTrayOpen: true,
      isDrawerOpen: false,
    });

    expect(res.insets.left).toBe(316);
    expect(res.insets.right).toBe(24);
    expect(res.freeArea.left).toBe(316);
    expect(res.freeArea.right).toBe(1416);
    expect(res.freeArea.width).toBe(1100);
    expect(res.freeArea.centerX).toBe(866);
    // Stage bar max width leaves 32px padding, ensuring zero overlap with tray (x: 0..300)
    expect(res.freeArea.centerX - res.freeArea.maxBarWidth / 2).toBeGreaterThanOrEqual(res.insets.left);
  });

  it("shifts free area to the left when drawer is open (380px + 16px)", () => {
    const res = computeViewportInsets({
      viewportWidth: 1440,
      viewportHeight: 900,
      isTrayOpen: false,
      isDrawerOpen: true,
    });

    expect(res.insets.left).toBe(24);
    expect(res.insets.right).toBe(396);
    expect(res.freeArea.left).toBe(24);
    expect(res.freeArea.right).toBe(1044);
    expect(res.freeArea.centerX).toBe(534);
    expect(res.freeArea.centerX + res.freeArea.maxBarWidth / 2).toBeLessThanOrEqual(res.freeArea.right);
  });

  it("centers cleanly when both parallel tray and drawer are open simultaneously", () => {
    const res = computeViewportInsets({
      viewportWidth: 1440,
      viewportHeight: 900,
      isTrayOpen: true,
      isDrawerOpen: true,
    });

    expect(res.insets.left).toBe(316);
    expect(res.insets.right).toBe(396);
    expect(res.freeArea.left).toBe(316);
    expect(res.freeArea.right).toBe(1044);
    expect(res.freeArea.width).toBe(728);
    expect(res.freeArea.centerX).toBe(680);
    expect(res.freeArea.maxBarWidth).toBe(696);

    // Left edge of bar is at 680 - 348 = 332 >= 316 (no overlap with tray)
    expect(res.freeArea.centerX - res.freeArea.maxBarWidth / 2).toBe(332);
    // Right edge of bar is at 680 + 348 = 1028 <= 1044 (no overlap with drawer)
    expect(res.freeArea.centerX + res.freeArea.maxBarWidth / 2).toBe(1028);
  });

  it("panel takes precedence over tray with 340px + 16px = 356px inset (B0)", () => {
    const res = computeViewportInsets({
      viewportWidth: 1440,
      viewportHeight: 900,
      isTrayOpen: true,
      activePanel: "journey",
      isDrawerOpen: false,
    });

    expect(res.insets.left).toBe(356);
  });
});
