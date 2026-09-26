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
    <Sheet open={isOpen} onOpenChange={(open) => !open && selectStep(null)}>
      <SheetContent side="right" className="border-white/10 bg-zinc-950 text-zinc-100">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Step Details</SheetTitle>
            <Badge variant="outline" className="text-[10px] text-zinc-400">
              Placeholder
            </Badge>
          </div>
          <SheetDescription className="text-zinc-400">
            Selected Step: {selectedStepId ?? "None"}
          </SheetDescription>
        </SheetHeader>
        <div className="p-4 text-xs text-zinc-500">
          Step inspection drawer will display official forms, fees, and documents in Milestone 3.
        </div>
      </SheetContent>
    </Sheet>
  );
}
