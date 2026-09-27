import { create } from "zustand";

export type ViewMode = "3d" | "2d";

export type LabelDensityMode = "key_steps" | "all";

export interface UndoToastState {
  taskId: string;
  stepId: string;
  title: string;
}

interface ViewState {
  viewMode: ViewMode;
  focusedStepId: string | null;
  hoveredStepId: string | null;
  criticalPathOn: boolean;
  webglFallbackReason: string | null;
  labelMode: LabelDensityMode;
  undoToast: UndoToastState | null;
  setViewMode: (mode: ViewMode) => void;
  setFocusedStepId: (id: string | null) => void;
  setHoveredStepId: (id: string | null) => void;
  toggleCriticalPath: () => void;
  setCriticalPathOn: (on: boolean) => void;
  setWebglFallbackReason: (reason: string | null) => void;
  setLabelMode: (mode: LabelDensityMode) => void;
  toggleLabelMode: () => void;
  showUndoToast: (toast: UndoToastState) => void;
  dismissUndoToast: () => void;
}

let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export const useViewStore = create<ViewState>((set) => ({
  viewMode: "3d",
  focusedStepId: null,
  hoveredStepId: null,
  criticalPathOn: false,
  webglFallbackReason: null,
  labelMode: "key_steps",
  undoToast: null,
  setViewMode: (viewMode) => set({ viewMode }),
  setFocusedStepId: (focusedStepId) => set({ focusedStepId }),
  setHoveredStepId: (hoveredStepId) => set({ hoveredStepId }),
  toggleCriticalPath: () =>
    set((state) => ({ criticalPathOn: !state.criticalPathOn })),
  setCriticalPathOn: (criticalPathOn) => set({ criticalPathOn }),
  setWebglFallbackReason: (webglFallbackReason) => set({ webglFallbackReason }),
  setLabelMode: (labelMode) => set({ labelMode }),
  toggleLabelMode: () =>
    set((state) => ({
      labelMode: state.labelMode === "key_steps" ? "all" : "key_steps",
    })),
  showUndoToast: (toast) => {
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    set({ undoToast: toast });
    toastTimeout = setTimeout(() => {
      set({ undoToast: null });
      toastTimeout = null;
    }, 8000);
  },
  dismissUndoToast: () => {
    if (toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }
    set({ undoToast: null });
  },
}));

let enterTimeout: ReturnType<typeof setTimeout> | null = null;
let leaveTimeout: ReturnType<typeof setTimeout> | null = null;

export function cancelPendingHover() {
  if (enterTimeout) {
    clearTimeout(enterTimeout);
    enterTimeout = null;
  }
  if (leaveTimeout) {
    clearTimeout(leaveTimeout);
    leaveTimeout = null;
  }
}

/**
 * Shared hover helper with 60ms enter delay and 200ms leave delay (§10.6).
 * Sweeping across stations or moving between 3D mesh and DOM label does not flicker.
 */
export function requestHover(id: string | null) {
  if (id !== null) {
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
      leaveTimeout = null;
    }
    if (useViewStore.getState().hoveredStepId === id) {
      if (enterTimeout) {
        clearTimeout(enterTimeout);
        enterTimeout = null;
      }
      return;
    }
    if (enterTimeout) {
      clearTimeout(enterTimeout);
    }
    enterTimeout = setTimeout(() => {
      useViewStore.getState().setHoveredStepId(id);
      enterTimeout = null;
    }, 60);
  } else {
    if (enterTimeout) {
      clearTimeout(enterTimeout);
      enterTimeout = null;
    }
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
    }
    leaveTimeout = setTimeout(() => {
      useViewStore.getState().setHoveredStepId(null);
      leaveTimeout = null;
    }, 200);
  }
}

