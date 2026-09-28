import { describe, it, expect } from "vitest";
import { shouldIgnoreSceneEvent } from "./useSceneKeyboard";

describe("shouldIgnoreSceneEvent (A3, §12.1)", () => {
  it("ignores keys when ctrlKey, metaKey, or altKey is true (A3)", () => {
    expect(shouldIgnoreSceneEvent({ key: "c", ctrlKey: true })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "ArrowRight", metaKey: true })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "ArrowLeft", altKey: true })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "ArrowRight", defaultPrevented: true })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "ArrowRight", isComposing: true })).toBe(true);
  });

  it("ignores all scene keys when any modal is open (isModalOpen=true) (A3)", () => {
    expect(shouldIgnoreSceneEvent({ key: "ArrowRight", isModalOpen: true })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "Enter", isModalOpen: true })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: " ", isModalOpen: true })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "ArrowRight", isModalOpen: false })).toBe(false);
  });

  it("skips Enter and Space when target is a button, a, summary, or interactive role (A3)", () => {
    expect(shouldIgnoreSceneEvent({ key: " ", targetTagName: "BUTTON" })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "Enter", targetTagName: "A" })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: " ", targetTagName: "SUMMARY" })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: " ", targetRole: "button" })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: " ", targetRole: "radio" })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: " ", targetRole: "checkbox" })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: " ", targetRole: "switch" })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "Enter", targetRole: "tab" })).toBe(true);

    // Other keys (e.g. Arrow keys) are not blocked just because target is a button
    expect(shouldIgnoreSceneEvent({ key: "ArrowRight", targetTagName: "BUTTON" })).toBe(false);

    // Space on non-interactive body is allowed
    expect(shouldIgnoreSceneEvent({ key: " ", targetTagName: "DIV" })).toBe(false);
  });

  it("ignores all keys when target is input, textarea, select, contenteditable, or drawer text (A3)", () => {
    expect(shouldIgnoreSceneEvent({ key: "ArrowRight", targetTagName: "INPUT" })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "ArrowRight", targetTagName: "TEXTAREA" })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "ArrowRight", targetTagName: "SELECT" })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "ArrowRight", targetIsContentEditable: true })).toBe(true);
    expect(shouldIgnoreSceneEvent({ key: "ArrowRight", targetInDrawer: true })).toBe(true);
  });
});
