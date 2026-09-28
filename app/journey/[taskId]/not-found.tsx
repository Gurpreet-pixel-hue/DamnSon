import Link from "next/link";
import { getJourneyRepository } from "@/lib/server/journeys";

export const metadata = {
  title: "Journey Not Found | CivicWeave",
  description: "The requested civic journey was not found.",
};

export default async function JourneyNotFound() {
  const repo = getJourneyRepository();
  const templates = await repo.listTemplates();

  return (
    <main
      data-testid="journey-not-found"
      className="min-h-screen bg-[var(--cw-background)] text-[var(--cw-text)] flex flex-col items-center justify-center p-6 md:p-12"
    >
      <div className="w-full max-w-2xl flex flex-col items-center text-center gap-6">
        {/* Brand Mark */}
        <Link href="/" className="inline-flex items-center gap-3">
          <svg className="w-9 h-9" viewBox="0 0 32 32" fill="none" aria-label="CivicWeave Mark">
            <path d="M4 8h24M8 16h20M4 24h24" stroke="var(--cw-brand)" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M12 4v24M20 4v24" stroke="var(--cw-available)" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
          <span className="text-xl font-bold tracking-tight text-[var(--cw-text)]">
            CivicWeave
          </span>
        </Link>

        {/* 404 Headline */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--cw-brand)]">
            404 &middot; Journey Not Found
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--cw-text)]">
            Journey not registered
          </h1>
          <p className="text-sm text-[var(--cw-text-muted)] max-w-md mx-auto leading-relaxed">
            The requested civic journey does not exist, has been archived, or is not yet published in the registry.
          </p>
        </div>

        {/* Primary Action */}
        <Link
          href="/"
          className="px-6 py-2.5 rounded-xl bg-[var(--cw-brand)] text-white text-xs font-semibold hover:opacity-95 transition-opacity shadow-xs"
        >
          Return to All Journeys
        </Link>

        {/* Published Journeys Quick Links */}
        {templates.length > 0 && (
          <div className="w-full mt-6 pt-6 border-t border-[var(--cw-border)]/60 text-left">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--cw-text-muted)] mb-3 text-center">
              Available Civic Journeys
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {templates.slice(0, 4).map((t) => (
                <Link
                  key={t.taskId}
                  href={`/journey/${t.taskId}`}
                  className="p-4 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)] hover:border-[var(--cw-brand)]/50 transition-all text-left flex flex-col gap-1 shadow-xs"
                >
                  <span className="text-xs font-semibold text-[var(--cw-text)] truncate">
                    {t.title}
                  </span>
                  <span className="text-[11px] text-[var(--cw-text-muted)]">
                    {t.verifiedStepCount} of {t.stepCount} verified &middot; {t.jurisdiction.city || t.jurisdiction.state}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
