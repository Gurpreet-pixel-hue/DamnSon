export interface ViewportInsetsParams {
  viewportWidth: number;
  viewportHeight: number;
  isTrayOpen: boolean;
  activePanel?: "journey" | "visits" | "documents" | null;
  isDrawerOpen: boolean;
  stepperBottomInset?: number;
}

export interface ViewportInsetsResult {
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  freeArea: {
    left: number;
    right: number;
    width: number;
    centerX: number;
    maxBarWidth: number;
  };
}

export const TRAY_WIDTH = 300;
export const PANEL_WIDTH = 340;
export const DRAWER_WIDTH = 380;
export const INSET_PADDING = 16;
export const DEFAULT_SIDE_INSET = 24;
export const DEFAULT_TOP_INSET = 56;
export const DEFAULT_BOTTOM_INSET = 133;

/**
 * Shared insets and free area calculation for 3D Camera framing (frameView)
 * and StageBar layout (§11.8, A2, B0).
 * Prevents stage bar overlapping the parallel tray, rail panels, or drawer.
 */
export function computeViewportInsets(params: ViewportInsetsParams): ViewportInsetsResult {
  const {
    viewportWidth,
    isTrayOpen,
    activePanel,
    isDrawerOpen,
    stepperBottomInset = DEFAULT_BOTTOM_INSET,
  } = params;

  // Left overlay: Active rail panel (340px) replaces tray, or parallel tray (300px)
  let leftInset = DEFAULT_SIDE_INSET;
  if (activePanel) {
    leftInset = PANEL_WIDTH + INSET_PADDING; // 356px
  } else if (isTrayOpen) {
    leftInset = TRAY_WIDTH + INSET_PADDING; // 316px
  }

  // Right overlay: Drawer (380px)
  const rightInset = isDrawerOpen
    ? DRAWER_WIDTH + INSET_PADDING // 396px
    : DEFAULT_SIDE_INSET; // 24px

  const topInset = DEFAULT_TOP_INSET;
  const bottomInset = stepperBottomInset;

  const freeLeft = leftInset;
  const freeRight = Math.max(freeLeft, viewportWidth - rightInset);
  const freeWidth = Math.max(0, freeRight - freeLeft);
  const centerX = Math.round(freeLeft + freeWidth / 2);
  const maxBarWidth = Math.max(0, freeWidth - 32);

  return {
    insets: {
      top: topInset,
      bottom: bottomInset,
      left: leftInset,
      right: rightInset,
    },
    freeArea: {
      left: freeLeft,
      right: freeRight,
      width: freeWidth,
      centerX,
      maxBarWidth,
    },
  };
}
