"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useViewStore, type ViewMode } from "@/lib/store/useViewStore";

function isViewMode(val: string): val is ViewMode {
  return val === "3d" || val === "2d";
}

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useViewStore();

  const handleValueChange = (val: string) => {
    if (isViewMode(val)) {
      setViewMode(val);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/80 p-1 shadow-2xl backdrop-blur-md">
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={handleValueChange}
        className="gap-1"
      >
        <ToggleGroupItem value="3d" aria-label="3D View" size="sm">
          3D
        </ToggleGroupItem>
        <ToggleGroupItem value="2d" aria-label="2D View" size="sm">
          2D
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
