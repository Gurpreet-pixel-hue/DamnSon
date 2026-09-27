/**
 * Civic Metro Color Palette
 *
 * Ground truth token values defined in docs/frontend-spec.md ("Colour tokens")
 * and mirrored in app/globals.css (--cw-*).
 * No raw hex values outside this file (PRD §11.6).
 */
export const PALETTE = {
  background: "#F5EFE3",
  surface: "#FFFFFF",
  surfaceMuted: "#FBF7EF",
  border: "#E4DACA",
  text: "#1D1A16",
  textMuted: "#5E574D",
  brand: "#B3261E",
  done: "#1E7F3B",
  available: "#1F63D6",
  locked: "#6B7078",
  undecided: "#B45309",
  attention: "#D97706",
  critical: "#D92D20",
  error: "#B42318",

  // Scene-only colours from docs/visual-direction.md §2:
  seaDeep: "#4E97AE",
  seaShallow: "#8CC3D1",
  land: "#E6DFD2",
  park: "#B7CF95",
  road: "#D6CCBA",
  roadEdge: "#C4B8A2",
  plaza: "#F2EBDD",
  slabSide: "#D9C9A8",
  sky: "#F3ECDF",
  fog: "#F3ECDF",
  sun: "#FFE6C0",
  hemiSky: "#FFF6E8",
  hemiGround: "#C9B794",
  trackNormal: "#9AA3AD",

  // Aliases for legacy scene components
  ground: "#E6DFD2",
  stationBase: "#F2EBDD",
  normalTrack: "#9AA3AD",
} as const;

export type PaletteKey = keyof typeof PALETTE;

