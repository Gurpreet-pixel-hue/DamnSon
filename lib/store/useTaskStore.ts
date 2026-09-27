import { create } from "zustand";
import {
  persist,
  createJSONStorage,
  type StateStorage,
} from "zustand/middleware";
import { z } from "zod";
import { parseFacts, type FactKey, type FactValue, type Facts } from "@/lib/contract/facts";

const persistedProgressSchema = z.object({
  completedByTask: z.record(z.string(), z.array(z.string())).catch({}),
  factsByTask: z
    .record(z.string(), z.unknown())
    .transform((rec) => {
      const out: Record<string, Facts> = {};
      for (const [taskId, rawFacts] of Object.entries(rec)) {
        out[taskId] = parseFacts(rawFacts);
      }
      return out;
    })
    .catch({}),
  documentChecklist: z
    .record(z.string(), z.record(z.string(), z.boolean()))
    .catch({}),
});

export interface TaskState {
  activeTaskId: string | null;
  selectedStepId: string | null;
  factsByTask: Record<string, Facts>;
  completedByTask: Record<string, string[]>;
  documentChecklist: Record<string, Record<string, boolean>>;
  setActiveTask: (taskId: string | null) => void;
  selectStep: (stepId: string | null) => void;
  setFact: (taskId: string, key: FactKey, value: FactValue) => void;
  clearFact: (taskId: string, key: FactKey) => void;
  setFacts: (taskId: string, facts: Facts) => void;
  setCompleted: (taskId: string, stepIds: string[]) => void;
  toggleStepDone: (taskId: string, stepId: string) => void;
  toggleDocumentCheck: (taskId: string, docKey: string) => void;
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
        factsByTask: {},
        completedByTask: {},
        documentChecklist: {},
        setActiveTask: (taskId) => set({ activeTaskId: taskId }),
        selectStep: (stepId) => set({ selectedStepId: stepId }),
        setFact: (taskId, key, value) =>
          set((state) => ({
            factsByTask: {
              ...state.factsByTask,
              [taskId]: {
                ...(state.factsByTask[taskId] ?? {}),
                [key]: value,
              },
            },
          })),
        clearFact: (taskId, key) =>
          set((state) => {
            const currentFacts = { ...(state.factsByTask[taskId] ?? {}) };
            delete currentFacts[key];
            return {
              factsByTask: {
                ...state.factsByTask,
                [taskId]: currentFacts,
              },
            };
          }),
        setFacts: (taskId, facts) =>
          set((state) => ({
            factsByTask: {
              ...state.factsByTask,
              [taskId]: parseFacts(facts),
            },
          })),
        setCompleted: (taskId, stepIds) =>
          set((state) => ({
            completedByTask: {
              ...state.completedByTask,
              [taskId]: [...stepIds],
            },
          })),
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
        toggleDocumentCheck: (taskId, docKey) =>
          set((state) => {
            const taskDocs = { ...(state.documentChecklist[taskId] ?? {}) };
            taskDocs[docKey] = !taskDocs[docKey];
            return {
              documentChecklist: {
                ...state.documentChecklist,
                [taskId]: taskDocs,
              },
            };
          }),
      }),
      {
        name: "damnson-progress-v3",
        version: 3,
        storage: customStorage
          ? createJSONStorage(() => customStorage)
          : createJSONStorage(() =>
              typeof window !== "undefined" ? localStorage : noopStorage
            ),
        partialize: (state) => ({
          factsByTask: state.factsByTask,
          completedByTask: state.completedByTask,
          documentChecklist: state.documentChecklist,
        }),
        merge: (persisted, current) => {
          const parsed = persistedProgressSchema.safeParse(persisted ?? {});
          if (!parsed.success) return current;
          return {
            ...current,
            ...parsed.data,
          };
        },
        migrate: (persistedState: unknown, version: number) => {
          if (version < 2) {
            return { factsByTask: {}, completedByTask: {}, documentChecklist: {} };
          }
          if (version === 2) {
            const parsed = persistedProgressSchema.safeParse(persistedState ?? {});
            if (parsed.success) {
              return {
                ...parsed.data,
                documentChecklist: parsed.data.documentChecklist ?? {},
              };
            }
            return { factsByTask: {}, completedByTask: {}, documentChecklist: {} };
          }
          return persistedProgressSchema.parse(persistedState ?? {});
        },
        skipHydration: true,
      }
    )
  );
}

export const useTaskStore = createTaskStore();
