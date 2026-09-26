import { create } from "zustand";

export type ViewMode = "3d" | "2d";

interface ViewState {
  viewMode: ViewMode;
  focusedStepId: string | null;
  hoveredStepId: string | null;
  setViewMode: (mode: ViewMode) => void;
  setFocusedStepId: (id: string | null) => void;
  setHoveredStepId: (id: string | null) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  viewMode: "3d",
  focusedStepId: null,
  hoveredStepId: null,
  setViewMode: (viewMode) => set({ viewMode }),
  setFocusedStepId: (focusedStepId) => set({ focusedStepId }),
  setHoveredStepId: (hoveredStepId) => set({ hoveredStepId }),
}));
