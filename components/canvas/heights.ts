/**
 * Standard World Y Heights and Polygon Offset constants for CivicWeave diorama
 * (Pure TypeScript, visual-direction §11.5)
 *
 * Enforces z-fight-free layering with strict >= 0.01 spacing between adjacent layers
 * and polygonOffset factor/units of -1 per layer above land.
 */

export const HEIGHTS = {
  landTop: 0.170,
  roadSurface: 0.180,
  routeLane: 0.195,
  plazaPadTop: 0.210,
  ringsAndDecals: 0.225,
  pulses: 0.240,
} as const;

export type HeightLayerKey = keyof typeof HEIGHTS;

/**
 * Kenney road tiles have asphalt surface at local y = 0.010.
 * To place road surface at World y = 0.180, instance y = 0.180 - 0.010 = 0.170.
 */
export const ROAD_TILE_SURFACE_Y = 0.010;
export const ROAD_INSTANCE_Y = HEIGHTS.roadSurface - ROAD_TILE_SURFACE_Y; // 0.170

/**
 * Station plaza pad is a cylinder of height 0.040.
 * Its center is at y = plazaPadTop - 0.020 = 0.190 so its top face sits at 0.210.
 */
export const PLAZA_PAD_HEIGHT = 0.040;
export const PLAZA_PAD_CENTER_Y = HEIGHTS.plazaPadTop - PLAZA_PAD_HEIGHT / 2; // 0.190

/**
 * Polygon offset configuration: -1 per layer above land.
 * Factor and units match to avoid depth buffer precision conflicts.
 */
export const POLYGON_OFFSETS = {
  land: { factor: 0, units: 0 },
  road: { factor: -1, units: -1 },
  routeLane: { factor: -2, units: -2 },
  plazaPad: { factor: -3, units: -3 },
  ringsAndDecals: { factor: -4, units: -4 },
  pulses: { factor: -5, units: -5 },
} as const;
