/**
 * SVG paths for §9.2 Intro Sequence.
 * Authored in code, with no downloaded artwork.
 */

export const STRAIGHT_LINE_PATH = "M 80 250 L 920 250";

/** Precomputed tangled maze path (starts around x:80, loops through maze, ends at x:920) */
export const TANGLED_PATH =
  "M 80 250 C 180 120 220 380 320 250 C 420 120 340 400 500 250 C 660 100 580 380 700 230 C 780 120 840 370 920 250";

export const STATION_DOTS = [
  { cx: 280, cy: 250 },
  { cx: 500, cy: 250 },
  { cx: 720, cy: 250 },
];
