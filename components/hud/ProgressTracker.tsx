"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ProgressTracker() {
  return (
    <Card className="border-white/10 bg-zinc-950/80 shadow-2xl backdrop-blur-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          Progress
        </CardTitle>
        <Badge variant="outline" className="text-[10px] text-zinc-400">
          Placeholder
        </Badge>
      </CardHeader>
      <CardContent className="p-3 pt-1">
        <div className="text-sm font-semibold text-zinc-200">
          0 of 0 steps done
        </div>
      </CardContent>
    </Card>
  );
}
