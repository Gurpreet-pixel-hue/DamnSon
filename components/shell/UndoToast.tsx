"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { useViewStore } from "@/lib/store/useViewStore";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { cancelAutoAdvance } from "./RightDrawer";

export function UndoToast() {
  const undoToast = useViewStore((s) => s.undoToast);
  const dismissUndoToast = useViewStore((s) => s.dismissUndoToast);
  const recomposeToast = useViewStore((s) => s.recomposeToast);
  const dismissRecomposeToast = useViewStore((s) => s.dismissRecomposeToast);
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

  const stageBarTopOffset = useViewStore((s) => s.stageBarTopOffset);
  const toastBottom = (stageBarTopOffset > 0 ? stageBarTopOffset : 133) + 12;

  return (
    <aside
      aria-label="Notifications and alerts"
      style={{ bottom: `${toastBottom}px` }}
      className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none transition-[bottom] duration-150"
    >
      {/* Undo Toast */}
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
            className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] shadow-lg backdrop-blur-md select-none text-xs"
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

      {/* Recompose Diff Toast (Amendment 4) */}
      <AnimatePresence>
        {recomposeToast && !undoToast && (
          <motion.div
            key={recomposeToast}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            data-testid="recompose-toast"
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] shadow-lg backdrop-blur-md select-none text-xs"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full bg-[var(--cw-brand)] shrink-0"
                aria-hidden="true"
              />
              <span className="font-semibold text-[var(--cw-text)]">
                Journey updated:
              </span>
              <span className="font-medium text-[var(--cw-text-muted)] truncate max-w-[280px] sm:max-w-[420px]">
                {recomposeToast}
              </span>
            </div>
            <button
              type="button"
              data-testid="dismiss-recompose-toast"
              onClick={dismissRecomposeToast}
              className="text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] p-0.5 rounded transition-colors"
              aria-label="Dismiss"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
