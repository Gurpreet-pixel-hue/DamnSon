import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setArrivedFromLanding,
  getArrivedFromLanding,
  consumeArrivedFromLanding,
  shouldPlayEntrance,
} from "./entranceState";
import { easeBackOut } from "./useEntrance";

describe("Landing → Journey Entrance (§9.4)", () => {
  beforeEach(() => {
    setArrivedFromLanding(false);
    vi.restoreAllMocks();
  });

  it("evaluates easeBackOut correctly", () => {
    expect(easeBackOut(0)).toBeCloseTo(0, 2);
    expect(easeBackOut(1)).toBeCloseTo(1, 2);
    // At t=0.5, back.out should overshoot slightly
    expect(easeBackOut(0.5)).toBeGreaterThan(0.5);
  });

  it("handles arrivedFromLanding flag lifecycle", () => {
    expect(getArrivedFromLanding()).toBe(false);
    expect(shouldPlayEntrance()).toBe(false);

    setArrivedFromLanding(true);
    expect(getArrivedFromLanding()).toBe(true);
    expect(shouldPlayEntrance()).toBe(true);

    const consumed = consumeArrivedFromLanding();
    expect(consumed).toBe(true);
    expect(getArrivedFromLanding()).toBe(false);
    expect(shouldPlayEntrance()).toBe(false);
  });
});
