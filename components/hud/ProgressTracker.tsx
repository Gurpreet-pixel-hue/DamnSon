"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { MetroVM } from "@/lib/graph/viewModel";

interface ProgressTrackerProps {
  metro?: MetroVM | null;
}

export function ProgressTracker({ metro }: ProgressTrackerProps) {
  const { total, done } = useMemo(() => {
    if (!metro) return { total: 0, done: 0 };
    const applicable = metro.stations.filter(
      (s) => s.applicability !== "optional"
    );
    const completed = applicable.filter((s) => s.state === "done");
    return {
      total: applicable.length,
      done: completed.length,
    };
  }, [metro]);

  return (
    <Card className="border-white/10 bg-zinc-950/80 shadow-2xl backdrop-blur-md">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-1">
        <div className="text-sm font-semibold text-zinc-200">
          {done} of {total} steps done
        </div>
      </CardContent>
    </Card>
  );
}
