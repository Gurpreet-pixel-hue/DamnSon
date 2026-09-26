import { create } from "zustand";
import {
  persist,
  createJSONStorage,
  type StateStorage,
} from "zustand/middleware";
import { z } from "zod";

const persistedProgressSchema = z.object({
  completedByTask: z.record(z.string(), z.array(z.string())).catch({}),
  answersByTask: z.record(z.string(), z.record(z.string(), z.boolean())).catch({}),
});

export interface TaskState {
  activeTaskId: string | null;
  selectedStepId: string | null;
  completedByTask: Record<string, string[]>;
  answersByTask: Record<string, Record<string, boolean>>;
  setActiveTask: (taskId: string | null) => void;
  selectStep: (stepId: string | null) => void;
  toggleStepDone: (taskId: string, stepId: string) => void;
  setAnswer: (taskId: string, questionId: string, answer: boolean) => void;
  clearAnswers: (taskId: string) => void;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export function createTaskStore(customStorage?: StateStorage) {
  return create<TaskState>()(
    persist(
      (set) => ({
        activeTaskId: null,
        selectedStepId: null,
        completedByTask: {},
        answersByTask: {},
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
        setAnswer: (taskId, questionId, answer) =>
          set((state) => ({
            answersByTask: {
              ...state.answersByTask,
              [taskId]: {
                ...(state.answersByTask[taskId] ?? {}),
                [questionId]: answer,
              },
            },
          })),
        clearAnswers: (taskId) =>
          set((state) => ({
            answersByTask: {
              ...state.answersByTask,
              [taskId]: {},
            },
          })),
      }),
      {
        name: "damnson-progress-v1",
        version: 1,
        storage: customStorage
          ? createJSONStorage(() => customStorage)
          : createJSONStorage(() =>
              typeof window !== "undefined" ? localStorage : noopStorage
            ),
        partialize: (state) => ({
          completedByTask: state.completedByTask,
          answersByTask: state.answersByTask,
        }),
        merge: (persisted, current) => ({
          ...current,
          ...persistedProgressSchema.parse(persisted ?? {}),
        }),
        migrate: (persistedState: unknown) => {
          return persistedProgressSchema.parse(persistedState ?? {});
        },
        skipHydration: true,
      }
    )
  );
}

export const useTaskStore = createTaskStore();
