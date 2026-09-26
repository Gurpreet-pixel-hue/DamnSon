"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface NodeFormModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NodeFormModal({
  open = false,
  onOpenChange,
}: NodeFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Edit Step</DialogTitle>
            <Badge variant="outline" className="text-[10px] text-zinc-400">
              Placeholder
            </Badge>
          </div>
          <DialogDescription className="text-zinc-400">
            Node editing form will be implemented in Milestone 4 with full schema validation.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
