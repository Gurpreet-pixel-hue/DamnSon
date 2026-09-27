import Link from "next/link";

export default function JourneyNotFound() {
  return (
    <div
      data-testid="journey-not-found"
      className="min-h-screen bg-[var(--cw-background)] text-[var(--cw-text)] flex flex-col items-center justify-center p-6"
    >
      <div className="w-full max-w-md p-8 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] shadow-sm text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-700 dark:text-amber-300 font-mono font-bold text-lg">
          404
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight text-[var(--cw-text)]">
            Journey not found
          </h1>
          <p className="text-sm text-[var(--cw-text-muted)] leading-relaxed">
            The requested civic journey does not exist, has been archived, or is not yet published in the registry.
          </p>
        </div>
        <Link
          href="/"
          className="mt-2 px-5 py-2.5 rounded-lg bg-[var(--cw-brand)] text-white text-xs font-semibold tracking-wide hover:opacity-90 transition-opacity"
        >
          Return to journeys
        </Link>
      </div>
    </div>
  );
}
