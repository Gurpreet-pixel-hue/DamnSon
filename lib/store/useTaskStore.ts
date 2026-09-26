import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface TaskState {
  activeTaskId: string | null;
  selectedStepId: string | null;
  completedByTask: Record<string, string[]>;
  setActiveTask: (taskId: string | null) => void;
  selectStep: (stepId: string | null) => void;
  toggleStepDone: (taskId: string, stepId: string) => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      activeTaskId: null,
      selectedStepId: null,
      completedByTask: {},
      setActiveTask: (taskId) => set({ activeTaskId: taskId }),
      selectStep: (stepId) => set({ selectedStepId: stepId }),
      toggleStepDone: (taskId, stepId) =>
        set((state) => {
          const currentList = state.completedByTask[taskId] ?? [];
          const exists = currentList.includes(stepId);
          const updated = exists
            ? currentList.filter((id) => id !== stepId)
            : [...currentList, stepId];
          return {
            completedByTask: {
              ...state.completedByTask,
              [taskId]: updated,
            },
          };
        }),
    }),
    {
      name: "damnson-progress-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ completedByTask: state.completedByTask }),
      skipHydration: true,
    }
  )
);
