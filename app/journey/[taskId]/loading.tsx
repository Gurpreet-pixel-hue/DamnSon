export default function JourneyLoading() {
  return (
    <div
      data-testid="journey-loading-skeleton"
      className="min-h-screen bg-[var(--cw-background)] text-[var(--cw-text)] flex flex-col p-4 gap-4"
    >
      {/* Top bar skeleton 72px */}
      <div className="h-[72px] rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] px-6 flex items-center justify-between shadow-xs animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-[var(--cw-border)]/60" />
          <div className="flex flex-col gap-1.5">
            <div className="w-24 h-4 rounded bg-[var(--cw-border)]/60" />
            <div className="w-32 h-3 rounded bg-[var(--cw-border)]/40" />
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <div className="w-28 h-10 rounded-lg bg-[var(--cw-border)]/40" />
          <div className="w-28 h-10 rounded-lg bg-[var(--cw-border)]/40" />
          <div className="w-28 h-10 rounded-lg bg-[var(--cw-border)]/40" />
          <div className="w-28 h-10 rounded-lg bg-[var(--cw-border)]/40" />
        </div>
        <div className="w-24 h-9 rounded-lg bg-[var(--cw-border)]/60" />
      </div>

      {/* Main body skeleton */}
      <div className="flex-1 flex gap-4 min-h-[560px]">
        {/* Rail skeleton */}
        <div className="hidden md:flex flex-col gap-3 w-16 xl:w-[200px] rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-3 animate-pulse">
          <div className="w-full h-10 rounded-lg bg-[var(--cw-border)]/40" />
          <div className="w-full h-10 rounded-lg bg-[var(--cw-border)]/40" />
        </div>

        {/* 3D Window card skeleton */}
        <div className="flex-1 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] flex flex-col items-center justify-center p-8 shadow-xs animate-pulse relative overflow-hidden">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--cw-brand)] border-t-transparent animate-spin mb-4" />
          <span className="text-sm font-medium text-[var(--cw-text-muted)]">
            Loading journey diorama...
          </span>
        </div>
      </div>
    </div>
  );
}
