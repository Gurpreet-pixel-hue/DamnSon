import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getJourneyRepository } from "@/lib/server/journeys";
import { loadJourneyPage } from "../loadJourneyPage";
import { safeCompose } from "@/lib/graph/safeCompose";
import { analyzeJourney } from "@/lib/contract/analyze";
import { decodeShareState } from "@/lib/graph/shareState";
import { formatOfficeVisits, deriveFeeTile, deriveTimeTile } from "@/lib/graph/summary";
import { summarizeFees, summarizeTime } from "@/lib/graph/totals";
import { planOfficeTrips } from "@/lib/graph/trips";
import { buildStepDrawerModel } from "@/lib/graph/drawerModel";
import { isOfficialUrl } from "@/lib/contract/officialSources";
import { PrintButton } from "@/components/hud/PrintButton";
import type { ComposedStep } from "@/lib/contract/compose";
import { deriveStepCounts } from "@/lib/graph/stepCounts";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

interface PrintPageProps {
  params: Promise<{ taskId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ taskId: string }>;
}): Promise<Metadata> {
  const { taskId } = await params;
  const repo = getJourneyRepository();
  const result = await loadJourneyPage(repo, taskId);

  if (result.kind !== "ok") {
    return {
      title: "Checklist Not Found",
    };
  }

  return {
    title: `${result.data.published.template.title} — Checklist`,
    description: `Official procedure checklist for ${result.data.published.template.title}`,
  };
}

export default async function JourneyPrintPage({ params, searchParams }: PrintPageProps) {
  const { taskId } = await params;
  const sParams = searchParams ? await searchParams : undefined;

  const repo = getJourneyRepository();
  const result = await loadJourneyPage(repo, taskId);

  if (result.kind === "not_found") {
    notFound();
  }

  if (result.kind === "invalid") {
    throw new Error(`Invalid journey graph: ${result.issues.join(", ")}`);
  }

  const { template, modules } = result.data.published;

  // Decode search params if provided
  let initialFacts = {};
  const completedIds = new Set<string>();

  if (sParams) {
    const urlParams = new URLSearchParams();
    for (const [k, v] of Object.entries(sParams)) {
      if (typeof v === "string") {
        urlParams.set(k, v);
      } else if (Array.isArray(v) && v[0]) {
        urlParams.set(k, v[0]);
      }
    }
    const shareState = decodeShareState(urlParams);
    if (shareState) {
      initialFacts = shareState.facts;
      for (const id of shareState.completed) {
        completedIds.add(id);
      }
    }
  }

  // Compose with facts
  const composedResult = safeCompose(template, modules, initialFacts);
  const journey = composedResult.ok ? composedResult.journey : result.data.journey;

  // Topological sorting via analyzeJourney
  const analysis = analyzeJourney(journey);
  const stepMap = new Map<string, ComposedStep>(journey.steps.map((s) => [s.id, s]));
  const orderedSteps: ComposedStep[] = analysis.ok && analysis.order.length > 0
    ? (analysis.order.map((id) => stepMap.get(id)).filter(Boolean) as ComposedStep[])
    : journey.steps;

  // Totals & Honest Tiles (A7, PRD §8.8)
  const feeSummary = summarizeFees(journey, completedIds);
  const timeSummary = summarizeTime(journey, completedIds);
  const trips = planOfficeTrips(journey);
  const feeTile = deriveFeeTile(feeSummary);
  const timeTile = deriveTimeTile(timeSummary);
  const officeVisitsText = formatOfficeVisits(trips);

  const locationText = template.jurisdiction.city
    ? `${template.jurisdiction.city}, ${template.jurisdiction.state}`
    : template.jurisdiction.state;

  // Derive date range from step sources / lastVerified if present (A6)
  const stepCounts = deriveStepCounts(journey);
  const verifiedDates = orderedSteps
    .flatMap((s) => (s.kind !== "milestone" ? s.sources : []))
    .map((src) => src.retrievedOn)
    .filter(Boolean)
    .sort();
  const dateCheckedText =
    verifiedDates.length > 0
      ? `Data checked: ${verifiedDates[0]}${verifiedDates[verifiedDates.length - 1] !== verifiedDates[0] ? ` – ${verifiedDates[verifiedDates.length - 1]}` : ""}`
      : null;

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-zinc-200">
      {/* Top Floating Action Bar (hidden in print) */}
      <nav
        aria-label="Print controls"
        className="print:hidden sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-4 max-w-5xl mx-auto shadow-xs"
      >
        <Link
          href={`/journey/${taskId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to interactive map</span>
        </Link>

        <div className="flex items-center gap-3">
          <PrintButton />
        </div>
      </nav>

      {/* Main Printable Document */}
      <main className="max-w-4xl mx-auto px-6 py-8 sm:px-10 sm:py-12 flex flex-col gap-8 print:p-0 print:max-w-none">
        {/* Document Header */}
        <header className="border-b-2 border-zinc-900 pb-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-zinc-500">
                  CivicWeave checklist · not an official document
                </span>
                <span className="text-zinc-300">|</span>
                <span className="text-xs font-semibold text-zinc-600">{locationText}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 leading-tight">
                {template.title}
              </h1>
            </div>

            {dateCheckedText && (
              <div className="shrink-0 text-right print:block">
                <div className="text-[11px] font-mono font-medium text-zinc-600">
                  {dateCheckedText}
                </div>
              </div>
            )}
          </div>

          <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed max-w-3xl">
            {template.summary}
          </p>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-200 text-xs">
            <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Total Steps
              </span>
              <span className="text-base font-bold text-zinc-900 mt-0.5">
                {stepCounts.total} steps
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Estimated Fee
              </span>
              <span className="text-base font-bold text-zinc-900 mt-0.5">
                {feeTile.value}
              </span>
              {feeTile.subtext && (
                <span className="text-[11px] text-zinc-500 mt-0.5">
                  {feeTile.subtext}
                </span>
              )}
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Official Timeline
              </span>
              <span className="text-base font-bold text-zinc-900 mt-0.5">
                {timeTile.value}
              </span>
              {timeTile.subtext && (
                <span className="text-[11px] text-zinc-500 mt-0.5">
                  {timeTile.subtext}
                </span>
              )}
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Office Visits
              </span>
              <span className="text-base font-bold text-zinc-900 mt-0.5">
                {officeVisitsText}
              </span>
            </div>
          </div>
        </header>

        {/* Steps List */}
        <section aria-label="Procedure Steps" className="flex flex-col gap-6">
          <div className="flex items-center justify-between pb-1 border-b border-zinc-200">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
              Steps in Recommended Order
            </h2>
            <span className="text-xs text-zinc-500 font-medium">
              Complete each step before proceeding to dependent steps
            </span>
          </div>

          <div className="flex flex-col gap-6">
            {orderedSteps.map((step, index) => {
              const model = buildStepDrawerModel(step, journey, completedIds, {});
              const isDone = completedIds.has(step.id);

              return (
                <article
                  key={step.id}
                  data-testid={`print-step-${step.id}`}
                  className="break-inside-avoid border border-zinc-300 rounded-xl p-5 bg-white flex flex-col gap-4 shadow-2xs print:shadow-none print:border-zinc-400"
                >
                  {/* Step Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Checkbox box for citizen tracking */}
                      <div
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                          isDone
                            ? "bg-zinc-900 border-zinc-900 text-white"
                            : "border-zinc-400 bg-white"
                        }`}
                        aria-hidden="true"
                      >
                        {isDone && (
                          <svg
                            className="w-4 h-4 text-white"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold text-zinc-500">
                            Step {index + 1}
                          </span>
                          <span className="text-zinc-300">·</span>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                            {model.department}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-zinc-900 leading-snug">
                          {model.title}
                        </h3>
                      </div>
                    </div>

                    {/* Step Badges */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {model.modeLabel && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                          {model.modeLabel}
                        </span>
                      )}
                      {model.kind === "milestone" && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          Milestone
                        </span>
                      )}
                      {step.applicability === "optional" && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                          Optional
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Summary / Description */}
                  {model.overview.description && (
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      {model.overview.description}
                    </p>
                  )}

                  {/* Action Step Details Grid */}
                  {model.kind !== "milestone" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-zinc-50/70 p-3.5 rounded-lg border border-zinc-200">
                      {/* Fees */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                          Official Fee
                        </span>
                        <span className="font-semibold text-zinc-900">
                          {model.fees.feeDisplayText}
                          {model.fees.feeRecurrenceLabel && (
                            <span className="text-zinc-500 font-normal ml-1">
                              ({model.fees.feeRecurrenceLabel})
                            </span>
                          )}
                        </span>
                        {model.fees.feeNote && (
                          <span className="text-[11px] text-zinc-500">
                            {model.fees.feeNote}
                          </span>
                        )}
                      </div>

                      {/* Processing SLA */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                          Official Timeline
                        </span>
                        <span className="font-semibold text-zinc-900">
                          {model.fees.slaDisplayText}
                        </span>
                        {model.fees.slaWording && (
                          <span className="text-[11px] text-zinc-500">
                            {model.fees.slaWording}
                          </span>
                        )}
                      </div>

                      {/* Office details (if in-person or hybrid) */}
                      {model.overview.office && (
                        <div className="flex flex-col gap-0.5 md:col-span-2 pt-2 border-t border-zinc-200">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                            Office Location
                          </span>
                          <span className="font-semibold text-zinc-900">
                            {model.overview.office.name}
                          </span>
                          <span className="text-zinc-600">
                            {model.overview.office.address}
                            {model.overview.office.ward && ` · Ward: ${model.overview.office.ward}`}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            Hours: {model.overview.office.hours}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Required Documents */}
                  {model.documents.documents.length > 0 && (
                    <div className="flex flex-col gap-2 pt-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-700">
                        Required Documents ({model.documents.documents.length})
                      </span>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {model.documents.documents.map((doc) => (
                          <li
                            key={doc.key}
                            className="p-2.5 rounded-lg border border-zinc-200 bg-white flex items-start gap-2"
                          >
                            <span className="text-zinc-400 font-mono shrink-0 select-none">
                              [ ]
                            </span>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="font-medium text-zinc-900 leading-snug">
                                {doc.label}
                              </span>
                              <div className="text-[10px] text-zinc-500 flex flex-wrap gap-2">
                                {doc.acceptedFormats && (
                                  <span>Format: {doc.acceptedFormats}</span>
                                )}
                                {doc.maxSize && <span>Size: {doc.maxSize}</span>}
                              </div>
                              {doc.note && (
                                <p className="text-[10px] text-zinc-500">{doc.note}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Forms */}
                  {model.overview.forms.length > 0 && (
                    <div className="flex flex-col gap-2 pt-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-700">
                        Forms ({model.overview.forms.length})
                      </span>
                      <div className="flex flex-col gap-2 text-xs">
                        {model.overview.forms.map((form, fi) => (
                          <div
                            key={fi}
                            className="p-2.5 rounded-lg border border-zinc-200 bg-white flex flex-col gap-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-zinc-900">
                                {form.name}
                              </span>
                              {form.code && (
                                <span className="text-[10px] font-mono text-zinc-500">
                                  Code: {form.code}
                                </span>
                              )}
                            </div>
                            {form.url ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-mono text-zinc-600 break-all select-all">
                                  {form.url}
                                </span>
                                <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-zinc-200/60 text-zinc-700 shrink-0">
                                  {isOfficialUrl(form.url) ? "Official source" : "Other source"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-zinc-400 italic">
                                Form link not verified
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Online Portals & References */}
                  {(model.overview.portal?.url || model.sources.sources.length > 0) && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-zinc-200/80">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-700">
                        Online Portals & References
                      </span>

                      {/* Application Portal */}
                      {model.overview.portal?.url && (
                        <div className="p-2.5 rounded-lg border border-zinc-200 bg-zinc-50/50 flex flex-col gap-0.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-zinc-800">
                              {model.overview.portal.name || "Application Portal"}
                            </span>
                            <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-zinc-200/60 text-zinc-700 shrink-0">
                              {isOfficialUrl(model.overview.portal.url) ? "Official source" : "Other source"}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-zinc-700 break-all select-all">
                            {model.overview.portal.url}
                          </span>
                        </div>
                      )}

                      {/* Sources list */}
                      {model.sources.sources.map((src) => (
                        <div
                          key={src.id}
                          className="p-2.5 rounded-lg border border-zinc-200 bg-zinc-50/50 flex flex-col gap-0.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-zinc-800">
                              {src.title}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-zinc-200/60 text-zinc-700">
                                {isOfficialUrl(src.url) ? "Official source" : "Other source"}
                              </span>
                              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-zinc-200/60 text-zinc-700">
                                {src.kindLabel}
                              </span>
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-zinc-700 break-all select-all">
                            {src.url}
                          </span>
                          <div className="text-[10px] text-zinc-500">
                            Domain: {src.domain} · Retrieved: {src.retrievedOn}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Milestone or Step Outputs */}
                  {model.documents.outputs.length > 0 && (
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        Outputs Issued Upon Completion
                      </span>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {model.documents.outputs.map((out, oi) => (
                          <div
                            key={oi}
                            className="px-2.5 py-1 rounded bg-zinc-100 border border-zinc-200 text-zinc-800 font-medium"
                          >
                            ✓ {out.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-zinc-300 pt-6 mt-6 flex flex-col gap-2 text-xs text-zinc-500">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              CivicWeave · Open Civic Intelligence Platform · {locationText}
            </div>
            <div className="font-mono text-[10px]">
              {siteUrl} · {template.taskId}
            </div>
          </div>
          <div className="text-[11px] text-zinc-400 text-center sm:text-left">
            Fees, forms and timelines change. Check each official source before you act.
          </div>
        </footer>
      </main>
    </div>
  );
}
