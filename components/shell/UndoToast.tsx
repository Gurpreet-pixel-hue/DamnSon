"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { cancelAutoAdvance } from "./RightDrawer";

export function UndoToast() {
  const undoToast = useViewStore((s) => s.undoToast);
  const dismissUndoToast = useViewStore((s) => s.dismissUndoToast);
  const toggleStepDone = useTaskStore((s) => s.toggleStepDone);

  const handleUndo = () => {
    if (!undoToast) return;
    cancelAutoAdvance();
    if (undoToast.previousFocusStage !== undefined) {
      useViewStore.getState().setFocusStage(undoToast.previousFocusStage);
    }
    toggleStepDone(undoToast.taskId, undoToast.stepId);
    dismissUndoToast();
  };

  return (
    <AnimatePresence>
      {undoToast && (
        <motion.div
          key={`${undoToast.taskId}-${undoToast.stepId}`}
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          data-testid="undo-toast"
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] shadow-lg backdrop-blur-md select-none text-xs"
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full bg-[#1E7F3B] shrink-0"
              aria-hidden="true"
            />
            <span className="font-medium text-[var(--cw-text)] truncate max-w-[260px] sm:max-w-[360px]">
              Marked &lsquo;{undoToast.title}&rsquo; done
            </span>
          </div>
          <span className="text-[var(--cw-text-muted)]" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            data-testid="undo-toast-btn"
            onClick={handleUndo}
            className="font-bold text-[var(--cw-brand)] hover:underline focus-visible:outline-none shrink-0"
          >
            Undo
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
