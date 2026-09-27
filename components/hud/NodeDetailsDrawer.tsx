"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useTaskStore } from "@/lib/store/useTaskStore";

export function NodeDetailsDrawer() {
  const selectedStepId = useTaskStore((s) => s.selectedStepId);
  const selectStep = useTaskStore((s) => s.selectStep);

  const isOpen = selectedStepId !== null;

  return (
    <Sheet
      open={isOpen}
      modal={false}
      onOpenChange={(open) => !open && selectStep(null)}
    >
      <SheetContent
        side="right"
        showOverlay={false}
        className="border-l border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] pointer-events-auto shadow-xl"
      >
        <SheetHeader>
          <div className="flex items-center gap-2 pr-8">
            <SheetTitle className="text-[var(--cw-text)]">Step Details</SheetTitle>
            <Badge
              variant="outline"
              className="text-[10px] text-[var(--cw-text-muted)] border-[var(--cw-border)]"
            >
              Placeholder
            </Badge>
          </div>
          <SheetDescription className="text-[var(--cw-text-muted)]">
            Selected Step: {selectedStepId ?? "None"}
          </SheetDescription>
        </SheetHeader>
        <div className="p-4 text-xs text-[var(--cw-text-muted)]">
          Step inspection drawer will display official forms, fees, and documents in Milestone 3.
        </div>
      </SheetContent>
    </Sheet>
  );
}
