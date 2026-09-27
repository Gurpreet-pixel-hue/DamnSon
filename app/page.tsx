import Link from "next/link";
import { connection } from "next/server";
import { getJourneyRepository } from "@/lib/server/journeys";
import { LandingSearch } from "@/components/landing/LandingSearch";
import { ContinueCard } from "@/components/landing/ContinueCard";
import type { Question } from "@/lib/contract/schema";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CivicWeave · Your city. In order.",
  description: "Municipal bureaucracy and civic procedure path visualizer.",
};

export default async function HomePage() {
  await connection();
  const repo = getJourneyRepository();
  const templates = await repo.listTemplates();

  const questionsByTaskId: Record<string, Question[]> = {};
  for (const t of templates) {
    try {
      const published = await repo.getPublishedJourney(t.taskId);
      if (published) {
        questionsByTaskId[t.taskId] = published.template.questions;
      }
    } catch {
      // Ignore if not loaded
    }
  }

  return (
    <main className="min-h-screen bg-[var(--cw-background)] text-[var(--cw-text)] p-6 md:p-12 flex flex-col items-center">
      <div className="w-full max-w-4xl flex flex-col gap-10">
        {/* Continue Card (if saved progress exists) */}
        <ContinueCard templates={templates} />

        {/* Landing Natural-Language Search (§9.3) */}
        <LandingSearch templates={templates} questionsByTaskId={questionsByTaskId} />

        {/* Below the fold: Published journeys */}
        <section className="flex flex-col gap-4 pt-6 border-t border-[var(--cw-border)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
              Published Civic Journeys
            </h2>
            <span className="text-[11px] text-[var(--cw-text-muted)] font-medium">
              {templates.length} available
            </span>
          </div>

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
                  <span>{template.verifiedStepCount} of {template.stepCount} verified</span>
                  <span className="font-medium text-[var(--cw-brand)] group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                    Open journey &rarr;
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
        </section>
      </div>
    </main>
  );
}
