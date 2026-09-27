import { create } from "zustand";

export type ViewMode = "3d" | "2d";

/** Side panels next to the city window (not persisted). */
export type JourneyPanel = "questions" | "summary" | "whatif" | "documents" | "visits";

interface ViewState {
  viewMode: ViewMode;
  focusedStepId: string | null;
  hoveredStepId: string | null;
  criticalPathOn: boolean;
  webglFallbackReason: string | null;
  activePanel: JourneyPanel | null;
  setViewMode: (mode: ViewMode) => void;
  setFocusedStepId: (id: string | null) => void;
  setHoveredStepId: (id: string | null) => void;
  toggleCriticalPath: () => void;
  setCriticalPathOn: (on: boolean) => void;
  setWebglFallbackReason: (reason: string | null) => void;
  setActivePanel: (panel: JourneyPanel | null) => void;
  togglePanel: (panel: JourneyPanel) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  viewMode: "3d",
  focusedStepId: null,
  hoveredStepId: null,
  criticalPathOn: false,
  webglFallbackReason: null,
  activePanel: null,
  setViewMode: (viewMode) => set({ viewMode }),
  setFocusedStepId: (focusedStepId) => set({ focusedStepId }),
  setHoveredStepId: (hoveredStepId) => set({ hoveredStepId }),
  toggleCriticalPath: () =>
    set((state) => ({ criticalPathOn: !state.criticalPathOn })),
  setCriticalPathOn: (criticalPathOn) => set({ criticalPathOn }),
  setWebglFallbackReason: (webglFallbackReason) => set({ webglFallbackReason }),
  setActivePanel: (activePanel) => set({ activePanel }),
  togglePanel: (panel) =>
    set((state) => ({ activePanel: state.activePanel === panel ? null : panel })),
}));
