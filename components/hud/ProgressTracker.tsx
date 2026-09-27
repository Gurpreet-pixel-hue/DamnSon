"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { MetroVM } from "@/lib/graph/viewModel";
import { computeProgressCount } from "@/lib/graph/progress";

interface ProgressTrackerProps {
  metro?: MetroVM | null;
}

export function ProgressTracker({ metro }: ProgressTrackerProps) {
  const { total, done } = useMemo(() => computeProgressCount(metro), [metro]);

  return (
    <Card className="rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] shadow-[0_2px_8px_rgb(0_0_0/0.08)]">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-[var(--cw-text-muted)]">
          Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-1">
        <div className="text-sm font-semibold text-[var(--cw-text)]">
          {done} of {total} steps done
        </div>
      </CardContent>
    </Card>
  );
}
