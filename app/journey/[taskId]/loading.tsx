export default function JourneyLoading() {
  return (
    <div
      data-testid="journey-loading-skeleton"
      role="status"
      aria-label="Loading civic journey diorama"
      className="h-[100dvh] max-h-[100dvh] overflow-hidden bg-[var(--cw-background)] text-[var(--cw-text)] flex flex-col p-4 gap-4 box-border"
    >
      {/* Top bar skeleton 72px */}
      <header className="h-[72px] shrink-0 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] px-6 flex items-center justify-between shadow-xs select-none">
        <div className="flex items-center gap-3">
          <svg
            className="w-7 h-7 shrink-0 animate-pulse text-[var(--cw-brand)]"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
          >
            <path d="M4 8h24M8 16h20M4 24h24" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M12 4v24M20 4v24" stroke="var(--cw-available)" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold tracking-tight text-[var(--cw-text)]">
              CivicWeave
            </span>
            <div className="w-24 h-2.5 rounded bg-[var(--cw-border)]/50 animate-pulse" />
          </div>
        </div>

        {/* 4 Summary Tiles Skeleton */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="w-28 h-10 rounded-xl bg-[var(--cw-border)]/30 animate-pulse" />
          <div className="w-24 h-10 rounded-xl bg-[var(--cw-border)]/30 animate-pulse" />
          <div className="w-24 h-10 rounded-xl bg-[var(--cw-border)]/30 animate-pulse" />
          <div className="w-28 h-10 rounded-xl bg-[var(--cw-border)]/30 animate-pulse" />
        </div>

        <div className="w-28 h-9 rounded-xl bg-[var(--cw-border)]/40 animate-pulse" />
      </header>

      {/* Main Row: Rail + 3D Window Card */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
        {/* Left Rail Skeleton */}
        <aside className="hidden xl:flex flex-col gap-3 w-64 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] p-3 animate-pulse">
          <div className="w-full h-9 rounded-xl bg-[var(--cw-border)]/40" />
          <div className="w-full h-9 rounded-xl bg-[var(--cw-border)]/40" />
          <div className="mt-4 pt-4 border-t border-[var(--cw-border)]/40 flex flex-col gap-2">
            <div className="w-2/3 h-3 rounded bg-[var(--cw-border)]/40" />
            <div className="w-full h-20 rounded-xl bg-[var(--cw-border)]/20" />
          </div>
        </aside>

        {/* 3D Window Card Skeleton */}
        <div className="flex-1 min-w-0 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] flex flex-col shadow-xs relative overflow-hidden">
          {/* Stage Bar Header Skeleton */}
          <div className="h-12 border-b border-[var(--cw-border)]/40 px-6 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-6 h-6 rounded-full bg-[var(--cw-border)]/50" />
              <div className="w-32 h-3 rounded bg-[var(--cw-border)]/40" />
            </div>
            <div className="w-20 h-6 rounded-full bg-[var(--cw-border)]/30" />
          </div>

          {/* Centered Diorama Loading Graphic */}
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="w-10 h-10 rounded-full border-2 border-[var(--cw-brand)] border-t-transparent animate-spin mb-4" />
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
              Warming up diorama
            </p>
            <p className="text-[11px] text-[var(--cw-text-muted)]/70 mt-1">
              Compiling shaders &middot; Preparing transit map
            </p>
          </div>

          {/* Card Footer Skeleton */}
          <div className="h-12 border-t border-[var(--cw-border)]/40 px-4 flex items-center justify-between animate-pulse">
            <div className="w-40 h-4 rounded bg-[var(--cw-border)]/30" />
            <div className="flex items-center gap-2">
              <div className="w-16 h-7 rounded-lg bg-[var(--cw-border)]/30" />
              <div className="w-7 h-7 rounded-lg bg-[var(--cw-border)]/30" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
