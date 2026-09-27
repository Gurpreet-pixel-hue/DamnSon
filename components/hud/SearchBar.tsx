"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function SearchBar() {
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-2 shadow-[0_2px_8px_rgb(0_0_0/0.08)]"
    >
      <Input
        type="search"
        disabled
        placeholder="Describe a civic task — e.g. register a cloud kitchen in Bandra"
        className="h-9 flex-1 border-0 bg-transparent text-sm text-[var(--cw-text)] placeholder:text-[var(--cw-text-muted)] shadow-none focus-visible:ring-0"
      />
      <Badge variant="outline" className="text-[10px] text-[var(--cw-text-muted)] border-[var(--cw-border)]">
        Placeholder
      </Badge>
      <Button type="submit" disabled size="sm" className="bg-[var(--cw-brand)] text-white hover:bg-[var(--cw-brand)]/90">
        Search
      </Button>
    </form>
  );
}
