"use client";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function GraphEditorTable() {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950 p-4 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300">Procedure Steps</h2>
        <Badge variant="outline" className="text-[10px] text-zinc-400">
          Admin Table Placeholder
        </Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="text-zinc-400">Step</TableHead>
            <TableHead className="text-zinc-400">Department</TableHead>
            <TableHead className="text-zinc-400">Review</TableHead>
            <TableHead className="text-zinc-400">Sources</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="border-white/5 hover:bg-transparent">
            <TableCell
              colSpan={4}
              className="py-8 text-center text-sm text-zinc-500"
            >
              No steps loaded. Graph editor will load verified procedures in Milestone 4.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
