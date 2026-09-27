"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function SearchBar() {
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/80 p-2 shadow-2xl backdrop-blur-md"
    >
      <Input
        type="search"
        disabled
        placeholder="Describe a civic task — e.g. register a cloud kitchen in Bandra"
        className="h-9 flex-1 bg-transparent text-sm placeholder:text-zinc-500"
      />
      <Badge variant="outline" className="text-[10px] text-zinc-400">
        Placeholder
      </Badge>
      <Button type="submit" disabled size="sm">
        Search
      </Button>
    </form>
  );
}
