/**
 * Civic Metro Color Palette
 *
 * Ground truth token values defined in docs/frontend-spec.md ("Colour tokens")
 * and mirrored in app/globals.css (--cw-*).
 * No raw hex values outside this file (PRD §11.6).
 */
export const PALETTE = {
  background: "#09090b",
  surface: "#18181b",
  border: "#27272a",
  text: "#fafafa",
  textMuted: "#a1a1aa",
  available: "#22d3ee",
  done: "#34d399",
  locked: "#52525b",
  undecided: "#fbbf24",
  error: "#f87171",
  critical: "#67e8f9",
  // Scene-only colours from the spec:
  ground: "#0c0c0f",
  stationBase: "#3f3f46",
  normalTrack: "#3f3f46",
} as const;

export type PaletteKey = keyof typeof PALETTE;
