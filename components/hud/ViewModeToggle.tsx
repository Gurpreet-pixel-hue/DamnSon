"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toggle } from "@/components/ui/toggle";
import { useViewStore, type ViewMode } from "@/lib/store/useViewStore";

function isViewMode(val: string): val is ViewMode {
  return val === "3d" || val === "2d";
}

export function ViewModeToggle() {
  const { viewMode, setViewMode, criticalPathOn, toggleCriticalPath } =
    useViewStore();

  const handleValueChange = (val: string) => {
    if (isViewMode(val)) {
      setViewMode(val);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-1 shadow-[0_2px_8px_rgb(0_0_0/0.08)]">
        <Toggle
          pressed={criticalPathOn}
          onPressedChange={toggleCriticalPath}
          size="sm"
          aria-label="Toggle Critical Path"
          className="text-xs data-[state=on]:bg-[#D92D20]/15 data-[state=on]:text-[#D92D20] text-[var(--cw-text-muted)] hover:text-[var(--cw-text)]"
        >
          Critical Path
        </Toggle>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-1 shadow-[0_2px_8px_rgb(0_0_0/0.08)]">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={handleValueChange}
          className="gap-1"
        >
          <ToggleGroupItem
            value="3d"
            aria-label="3D View"
            size="sm"
            className="data-[state=on]:bg-[var(--cw-surface-muted)] data-[state=on]:text-[var(--cw-text)] text-[var(--cw-text-muted)]"
          >
            3D
          </ToggleGroupItem>
          <ToggleGroupItem
            value="2d"
            aria-label="2D View"
            size="sm"
            className="data-[state=on]:bg-[var(--cw-surface-muted)] data-[state=on]:text-[var(--cw-text)] text-[var(--cw-text-muted)]"
          >
            2D
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
