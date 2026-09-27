import Link from "next/link";
import { connection } from "next/server";
import { getJourneyRepository } from "@/lib/server/journeys";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CivicWeave · Your city. In order.",
  description: "Municipal bureaucracy and civic procedure path visualizer.",
};

export default async function HomePage() {
  await connection();
  const repo = getJourneyRepository();
  const templates = await repo.listTemplates();

  return (
    <main className="min-h-screen bg-[var(--cw-background)] text-[var(--cw-text)] p-6 md:p-12 flex flex-col items-center">
      <div className="w-full max-w-4xl flex flex-col gap-8">
        {/* Brand header */}
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <svg
              className="w-8 h-8 shrink-0"
              viewBox="0 0 32 32"
              fill="none"
              aria-label="CivicWeave Mark"
            >
              <path
                d="M4 8h24M8 16h20M4 24h24"
                stroke="var(--cw-brand)"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M12 4v24M20 4v24"
                stroke="var(--cw-available)"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--cw-text)]">
                CivicWeave
              </h1>
              <p className="text-xs uppercase tracking-widest text-[var(--cw-text-muted)] font-medium">
                Your city. In order.
              </p>
            </div>
          </div>
        </header>

        {templates.length === 0 ? (
          <div
            data-testid="empty-journey-list"
            className="p-12 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] text-center flex flex-col items-center justify-center gap-3 shadow-xs"
          >
            <p className="text-base font-semibold text-[var(--cw-text)]">
              No published journeys yet
            </p>
            <p className="text-xs text-[var(--cw-text-muted)] max-w-md leading-relaxed">
              Published civic journeys will appear here once registered in the template repository.
            </p>
          </div>
        ) : (
          <div
            data-testid="journey-list"
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {templates.map((template) => (
              <Link
                key={template.taskId}
                href={`/journey/${template.taskId}`}
                className="group p-5 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] hover:border-[var(--cw-brand)]/50 transition-all shadow-xs flex flex-col justify-between gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)] px-2 py-0.5 rounded bg-[var(--cw-border)]/30">
                      {template.jurisdiction.city
                        ? `${template.jurisdiction.city}, ${template.jurisdiction.state}`
                        : template.jurisdiction.state}
                    </span>
                    <span className="text-[10px] text-[var(--cw-text-muted)]">
                      {template.stepCount} steps
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-[var(--cw-text)] group-hover:text-[var(--cw-brand)] transition-colors">
                    {template.title}
                  </h2>
                  <p className="text-xs text-[var(--cw-text-muted)] line-clamp-2 leading-relaxed">
                    {template.summary}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[var(--cw-border)]/50 text-[11px] text-[var(--cw-text-muted)]">
                  <span>{template.verifiedStepCount} verified steps</span>
                  <span className="font-medium text-[var(--cw-brand)] group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                    Open journey &rarr;
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
