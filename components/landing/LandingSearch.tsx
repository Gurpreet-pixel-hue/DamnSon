"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { searchResponseSchema, type TemplateSummary, type SearchResponse } from "@/lib/contract/api";
import { FACTS, type FactKey, type FactValue } from "@/lib/contract/facts";
import { formatFactValue } from "@/lib/graph/factDisplay";
import { highlightEvidence } from "@/lib/landing/evidenceHighlight";
import { selectLandingMatches } from "@/lib/landing/matchSelection";
import { suggestFacts, type SuggestedFact } from "@/lib/landing/suggestFacts";
import { GuidedQuestions } from "@/components/hud/GuidedQuestions";
import { FactInput } from "@/components/hud/FactInput";
import type { Question } from "@/lib/contract/schema";
import type { ComposedJourney } from "@/lib/contract/compose";
import { encodeShareState } from "@/lib/graph/shareState";
import { setArrivedFromLanding } from "@/components/canvas/entrance/entranceState";

export interface LandingSearchProps {
  templates: TemplateSummary[];
  questionsByTaskId?: Record<string, Question[]>;
  onNavigateStart?: () => void;
}

function getEvidenceSnippet(query: string, evidence?: string): string | null {
  if (!evidence) return null;
  const lowerQuery = query.toLowerCase();
  const lowerEvidence = evidence.toLowerCase();
  const idx = lowerQuery.indexOf(lowerEvidence);
  if (idx === -1) return evidence;
  const start = Math.max(0, idx - 20);
  const end = Math.min(query.length, idx + evidence.length + 20);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < query.length ? "…" : "";
  return prefix + query.slice(start, end) + suffix;
}

const noopSubscribe = () => () => {};

export function LandingSearch({
  templates,
  questionsByTaskId,
  onNavigateStart,
}: LandingSearchProps) {
  const router = useRouter();
  // true after hydration, false in the server render (keeps Search disabled until handlers exist)
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [confirmedFacts, setConfirmedFacts] = useState<Record<string, FactValue>>({});
  const [editingFactKey, setEditingFactKey] = useState<string | null>(null);
  const [hasDocked, setHasDocked] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const abortControllerRef = useRef<AbortController | null>(null);
  const latestReqIdRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const templateMap = useMemo(() => new Map(templates.map((t) => [t.taskId, t])), [templates]);
  const activeTemplate = selectedTaskId ? templateMap.get(selectedTaskId) : templates[0];

  const suggestedFacts = useMemo(() => {
    if (!searchResult) return [];
    const shouldSuggest =
      searchResult.mode === "lexical_fallback" ||
      (!searchResult.facts || searchResult.facts.length === 0);
    if (!shouldSuggest) return [];

    const allowed = activeTemplate?.questionFacts;
    const all = suggestFacts(query, allowed);
    return all.filter((s) => confirmedFacts[s.fact] === undefined && !dismissedSuggestions.has(s.fact));
  }, [searchResult, query, activeTemplate, confirmedFacts, dismissedSuggestions]);

  const handleConfirmSuggestion = (s: SuggestedFact) => {
    setConfirmedFacts((prev) => ({ ...prev, [s.fact]: s.value }));
  };

  const handleDismissSuggestion = (s: SuggestedFact) => {
    setDismissedSuggestions((prev) => new Set(prev).add(s.fact));
  };

  // Match selection
  const matchSelection = selectLandingMatches(
    searchResult ? searchResult.matches : [],
    selectedTaskId ?? undefined
  );

  const currentMatchTaskId = matchSelection.selectedMatch?.taskId ?? templates[0]?.taskId;
  const questionsForMatch = useMemo(() => {
    if (!currentMatchTaskId || !questionsByTaskId) return [];
    return questionsByTaskId[currentMatchTaskId] ?? [];
  }, [currentMatchTaskId, questionsByTaskId]);

  const landingJourney: ComposedJourney | null = useMemo(() => {
    const selected = matchSelection.selectedMatch ?? templates[0];
    if (!selected || questionsForMatch.length === 0) return null;
    return {
      taskId: selected.taskId,
      revision: selected.revision,
      title: selected.title,
      summary: selected.summary,
      category: selected.category,
      jurisdiction: { country: "IN" as const, ...selected.jurisdiction },
      facts: confirmedFacts,
      questions: questionsForMatch.map((q) => {
        const def = FACTS[q.fact];
        const totalSteps = selected?.stepCount ?? 20;
        let affected = 1;
        if (q.fact === "business.entity_type") affected = Math.min(12, totalSteps);
        else if (q.fact === "business.serves_food" || q.fact === "business.sector") affected = Math.min(4, totalSteps);
        else if (q.fact === "employees.count" || q.fact === "company.founders_count") affected = Math.min(3, totalSteps);
        else affected = Math.min(2, totalSteps);

        return {
          ...q,
          answerType: def?.type ?? "boolean",
          affectedStepCount: affected,
        };
      }),
      steps: [],
      edges: [],
      excluded: [],
    };
  }, [matchSelection.selectedMatch, templates, questionsForMatch, confirmedFacts]);

  // Perform search with AbortController, 6s timeout, and zod schema validation (A9)
  const doSearch = useCallback(
    async (q: string, loc?: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const reqId = ++latestReqIdRef.current;

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 6000);

      setIsSearching(true);
      setSearchError(null);
      setHasDocked(true);
      setDismissedSuggestions(new Set());

      try {
        const res = await fetch("/api/v1/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            query: trimmed,
            ...(loc?.trim() ? { location: loc.trim() } : {}),
          }),
        });

        clearTimeout(timeoutId);

        if (reqId !== latestReqIdRef.current) return;

        if (!res.ok) {
          throw new Error(`Search failed with status ${res.status}`);
        }

        const json = await res.json();
        const parsed = searchResponseSchema.safeParse(json);
        if (!parsed.success) {
          throw new Error("Search response is invalid. Please try again.");
        }

        const data = parsed.data;
        setSearchResult(data);

        // Auto-select first match
        if (data.matches.length > 0) {
          setSelectedTaskId(data.matches[0]!.taskId);
        } else {
          setSelectedTaskId(null);
        }

        // Fill location from jurisdiction if not manually set
        if (data.jurisdiction) {
          const parts: string[] = [];
          if (data.jurisdiction.city) parts.push(data.jurisdiction.city);
          if (data.jurisdiction.state) parts.push(data.jurisdiction.state);
          if (parts.length > 0 && !loc?.trim()) {
            setLocation(parts.join(", "));
          }
        }

        // Merge AI facts into confirmed facts without overwriting already confirmed facts (A9)
        if (data.facts && data.facts.length > 0) {
          setConfirmedFacts((prev) => {
            const next = { ...prev };
            for (const f of data.facts) {
              if (next[f.fact] === undefined) {
                next[f.fact] = f.value;
              }
            }
            return next;
          });
        }
      } catch (err) {
        if (reqId !== latestReqIdRef.current) return;
        if (err instanceof Error && err.name === "AbortError") {
          setSearchError("Search timed out. Please retry.");
        } else {
          setSearchError(err instanceof Error ? err.message : "Search is unavailable right now.");
        }
      } finally {
        if (reqId === latestReqIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query, location);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setQuery("");
      setSearchResult(null);
      setHasDocked(false);
      setSearchError(null);
    }
  };

  const handleTemplateChipClick = (t: TemplateSummary) => {
    setQuery(t.title);
    doSearch(t.title, location);
  };

  const handleLocationChipClick = (locChoice: string) => {
    setLocation(locChoice);
    setIsEditingLocation(false);
    if (query.trim()) {
      doSearch(query, locChoice);
    }
  };

  // Navigate to journey via share params without overwriting zustand store (A9, PRD §8.8)
  const handleMapRoute = () => {
    const targetTaskId = matchSelection.selectedMatch?.taskId ?? (templates[0]?.taskId || "start-business-mumbai");
    if (onNavigateStart) {
      onNavigateStart();
    }
    const allFacts = { ...confirmedFacts };
    if (location && !allFacts["location.city"]) {
      const parts = location.split(",").map((s) => s.trim());
      if (parts[0]) allFacts["location.city"] = parts[0];
      if (parts[1]) allFacts["location.state"] = parts[1];
    }
    setArrivedFromLanding(true);

    const shareQuery = encodeShareState({
      taskId: targetTaskId,
      facts: allFacts,
      completed: [],
    });
    router.push(`/journey/${targetTaskId}?${shareQuery}`);
  };

  return (
    <div className={`w-full transition-all duration-300 ${hasDocked ? "pt-2" : "pt-8 md:pt-16"}`}>
      {/* Brand Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <svg className="w-8 h-8 shrink-0" viewBox="0 0 32 32" fill="none" aria-label="CivicWeave Mark">
            <path d="M4 8h24M8 16h20M4 24h24" stroke="var(--cw-brand)" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M12 4v24M20 4v24" stroke="var(--cw-available)" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--cw-text)] leading-none">
              CivicWeave
            </h1>
            <p className="text-[10px] uppercase tracking-widest text-[var(--cw-text-muted)] font-medium mt-1">
              Your city. In order.
            </p>
          </div>
        </div>

        {/* Location chip */}
        <div className="flex items-center gap-2">
          {isEditingLocation ? (
            <div className="flex items-center gap-1.5 bg-[var(--cw-surface)] border border-[var(--cw-border)] rounded-full px-3 py-1 shadow-xs">
              <label htmlFor="landing-location-input" className="sr-only">
                Your city or state
              </label>
              <input
                id="landing-location-input"
                type="text"
                value={location}
                placeholder="City or state (e.g. Mumbai, MH)"
                onChange={(e) => setLocation(e.target.value)}
                onBlur={() => setIsEditingLocation(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setIsEditingLocation(false);
                    if (query.trim()) doSearch(query, location);
                  }
                }}
                autoFocus
                className="text-xs bg-transparent text-[var(--cw-text)] outline-none w-36"
              />
              <button
                type="button"
                onClick={() => setIsEditingLocation(false)}
                className="text-[10px] font-semibold text-[var(--cw-text-muted)] hover:text-[var(--cw-text)]"
              >
                Done
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingLocation(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] hover:border-[var(--cw-brand)]/40 transition-colors shadow-xs"
              title="Click to edit location"
              aria-label={`Location: ${location || "Auto"}. Click to edit.`}
            >
              <svg className="w-3.5 h-3.5 text-[var(--cw-brand)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 21s-8-7.5-8-12a8 8 0 1 1 16 0c0 4.5-8 12-8 12z" />
                <circle cx="12" cy="9" r="3" />
              </svg>
              <span>{location || "Location (auto)"}</span>
              <span className="text-[10px] text-[var(--cw-text-muted)]">✎</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Search Section */}
      <div className="flex flex-col gap-6">
        {!hasDocked && (
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-[var(--cw-text)]">
            What do you need to get done?
          </h2>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="landing-search-input" className="sr-only">
            What do you need to get done?
          </label>
          <div className="relative flex items-center">
            <input
              id="landing-search-input"
              type="text"
              data-testid="landing-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. I want to open a cloud kitchen in Andheri with 5 employees"
              className="w-full min-h-[64px] pl-5 pr-36 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] text-base md:text-lg text-[var(--cw-text)] shadow-xs placeholder:text-[var(--cw-text-muted)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--cw-brand)] focus:border-transparent transition-all"
            />
            <div className="absolute right-2.5 flex items-center gap-2">
              <button
                type="submit"
                data-testid="landing-search-btn"
                disabled={!mounted || isSearching || !query.trim()}
                className="min-h-[46px] px-5 rounded-xl bg-[var(--cw-brand)] text-white text-sm font-semibold hover:bg-[var(--cw-brand)]/90 disabled:opacity-50 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {isSearching ? (
                  <span>Searching...</span>
                ) : (
                  <>
                    <span>Search</span>
                    <span aria-hidden="true">&rarr;</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Example chips (published templates only) */}
          {!hasDocked && templates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-[var(--cw-text-muted)] font-medium">Try:</span>
              {templates.slice(0, 4).map((t) => (
                <button
                  key={t.taskId}
                  type="button"
                  onClick={() => handleTemplateChipClick(t)}
                  className="px-3 py-1 rounded-full text-xs font-medium border border-[var(--cw-border)] bg-[var(--cw-surface)] text-[var(--cw-text)] hover:border-[var(--cw-brand)]/50 hover:bg-[var(--cw-surface-muted)] transition-colors"
                >
                  {t.title}
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Results live container */}
        <div aria-live="polite" className="flex flex-col gap-6">
          {/* Loading skeleton */}
          {isSearching && (
            <div className="flex flex-col gap-3 p-5 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] animate-pulse">
              <div className="h-4 bg-[var(--cw-border)]/60 rounded w-1/3" />
              <div className="h-3 bg-[var(--cw-border)]/40 rounded w-2/3" />
              <div className="h-3 bg-[var(--cw-border)]/40 rounded w-1/2" />
            </div>
          )}

          {/* Hard error state with inline retry */}
          {searchError && (
            <div role="alert" className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-900 flex items-center justify-between text-xs">
              <span>{searchError}</span>
              <button
                type="button"
                onClick={() => doSearch(query, location)}
                className="px-3 py-1 font-semibold rounded bg-red-200 hover:bg-red-300 text-red-950 transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Lexical fallback notice (A9) */}
          {searchResult && searchResult.mode === "lexical_fallback" && (
            <div
              data-testid="search-mode-indicator"
              className="p-3 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface-muted)] text-xs text-[var(--cw-text-muted)] flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span>Matched by the words you typed. Check the suggestions below.</span>
            </div>
          )}

          {/* Notices: no_match, location_required, out_of_scope */}
          {searchResult && searchResult.notice && (
            <div className="p-5 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] flex flex-col gap-3">
              <p className="text-sm font-semibold text-[var(--cw-text)]">
                {searchResult.notice === "no_match" && "No civic routes matched your query."}
                {searchResult.notice === "location_required" && "Please specify your location."}
                {searchResult.notice === "out_of_scope" && "This request is outside the scope of supported civic procedures."}
              </p>
              <p className="text-xs text-[var(--cw-text-muted)]">
                {searchResult.notice === "no_match" && "Try searching for a business setup, trade registration, or municipal license, or explore the examples below."}
                {searchResult.notice === "location_required" && "Civic regulations vary by state and municipal corporation. Click the location chip above to choose your city."}
                {searchResult.notice === "out_of_scope" && "CivicWeave visualizes verified municipal and statutory compliance pathways."}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {templates.slice(0, 3).map((t) => (
                  <button
                    key={t.taskId}
                    type="button"
                    onClick={() => handleTemplateChipClick(t)}
                    className="px-3 py-1 rounded-full text-xs font-medium border border-[var(--cw-border)] bg-[var(--cw-surface-muted)] text-[var(--cw-text)] hover:border-[var(--cw-brand)] transition-colors cursor-pointer"
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Location clarification chips */}
          {searchResult && searchResult.clarifications && searchResult.clarifications.length > 0 && (
            <div className="flex flex-col gap-2 p-4 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface)]">
              {searchResult.clarifications
                .filter((c) => c.kind === "location" && c.options && c.options.length > 0)
                .map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[var(--cw-text-muted)] font-medium">{c.text}:</span>
                    {c.options.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleLocationChipClick(opt.value)}
                        className="px-2.5 py-1 rounded-full text-xs font-medium border border-[var(--cw-border)] bg-[var(--cw-surface-muted)] text-[var(--cw-text)] hover:border-[var(--cw-brand)] transition-colors cursor-pointer"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          )}

          {/* Fact Card with Highlighted Evidence (§9.3, A9) */}
          {Object.keys(confirmedFacts).length > 0 && (
            <div className="p-5 rounded-2xl border border-[var(--cw-border)] bg-[var(--cw-surface)] flex flex-col gap-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
                  Facts applied to your journey
                </h3>
                <span className="text-[11px] text-[var(--cw-done)] font-medium">✓ Confirmed by you</span>
              </div>

              <ul className="flex flex-col gap-2.5">
                {Object.entries(confirmedFacts).map(([factKey, factValue]) => {
                  const fk = factKey as FactKey;
                  const label = FACTS[fk]?.label || fk;
                  const question = questionsForMatch.find((q) => q.fact === fk);
                  const displayVal = formatFactValue(fk, factValue, question);
                  // Look up evidence in searchResult.facts or suggestedFacts
                  const aiFact = searchResult?.facts?.find((f) => f.fact === fk);
                  const suggestedMatch = suggestFacts(query).find((s) => s.fact === fk);
                  const evidenceStr = aiFact?.evidence || suggestedMatch?.evidence;
                  const snippet = getEvidenceSnippet(query, evidenceStr);
                  const segments = snippet && evidenceStr ? highlightEvidence(snippet, [evidenceStr]) : [];
                  const isEditing = editingFactKey === fk;

                  return (
                    <li key={fk} className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--cw-surface-muted)] border border-[var(--cw-border)]/60 text-xs">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--cw-text)]">{label}</span>
                          {!isEditing && (
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[var(--cw-border)]/40 text-[var(--cw-text)] font-medium">
                              {displayVal}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingFactKey(isEditing ? null : fk)}
                            className="px-2 py-0.5 rounded text-[11px] font-medium text-[var(--cw-brand)] hover:underline cursor-pointer"
                          >
                            {isEditing ? "Done" : "Edit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmedFacts((prev) => {
                                const next = { ...prev };
                                delete next[fk];
                                return next;
                              });
                              if (editingFactKey === fk) setEditingFactKey(null);
                            }}
                            className="px-2 py-0.5 rounded text-[11px] font-medium text-red-600 hover:text-red-800 cursor-pointer"
                            title="Remove fact"
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="pt-1">
                          <FactInput
                            fact={fk}
                            value={factValue}
                            options={question?.options}
                            label={`Edit ${label}`}
                            onChange={(newVal) => {
                              setConfirmedFacts((prev) => ({ ...prev, [fk]: newVal }));
                              setEditingFactKey(null);
                            }}
                          />
                        </div>
                      ) : (
                        evidenceStr && snippet && (
                          <div className="text-[11px] text-[var(--cw-text-muted)] leading-relaxed">
                            <span className="font-medium text-[var(--cw-text)]">From your words: </span>
                            <span>
                              {segments.map((seg, idx) =>
                                seg.highlighted ? (
                                  <mark key={idx} className="bg-amber-200 text-amber-900 rounded px-1 py-0.5 font-medium">
                                    {seg.text}
                                  </mark>
                                ) : (
                                  <span key={idx}>{seg.text}</span>
                                )
                              )}
                            </span>
                          </div>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Suggested answers from your words chip row (§9.3, C2, A9) */}
          {suggestedFacts.length > 0 && (
            <div className="p-4 rounded-2xl border border-amber-300/70 bg-amber-50/50 flex flex-col gap-3 shadow-xs" data-testid="suggested-facts">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-900">
                  Suggested from your words
                </h3>
                <span className="text-[11px] text-amber-700 font-medium">Nothing applied until confirmed</span>
              </div>

              <div className="flex flex-wrap gap-2.5" data-testid="suggested-facts-row">
                {suggestedFacts.map((s) => {
                  const label = FACTS[s.fact]?.label || s.fact;
                  const question = questionsForMatch.find((q) => q.fact === s.fact);
                  const displayVal = formatFactValue(s.fact, s.value, question);
                  const snippet = getEvidenceSnippet(query, s.evidence);
                  const segments = snippet ? highlightEvidence(snippet, [s.evidence]) : [];

                  return (
                    <div
                      key={s.fact}
                      data-testid={`suggested-chip-${s.fact}`}
                      className="flex items-center gap-2 p-2 rounded-xl bg-white border border-amber-200 text-xs shadow-xs"
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 font-medium text-[var(--cw-text)]">
                          <span>{label}:</span>
                          <span className="font-semibold text-amber-950 font-mono text-[11px] bg-amber-100/70 px-1.5 py-0.5 rounded">
                            {displayVal}
                          </span>
                        </div>
                        {snippet && (
                          <div className="text-[10px] text-[var(--cw-text-muted)]">
                            From: &ldquo;
                            {segments.map((seg, idx) =>
                              seg.highlighted ? (
                                <mark key={idx} className="bg-amber-200 text-amber-900 px-0.5 font-medium rounded">
                                  {seg.text}
                                </mark>
                              ) : (
                                <span key={idx}>{seg.text}</span>
                              )
                            )}
                            &rdquo;
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 pl-2 border-l border-amber-100">
                        <button
                          type="button"
                          data-testid={`confirm-fact-${s.fact}`}
                          onClick={() => handleConfirmSuggestion(s)}
                          className="px-2 py-1 rounded bg-[var(--cw-done)] text-white text-[11px] font-semibold hover:bg-[var(--cw-done)]/90 transition-colors cursor-pointer"
                          title="Confirm this fact"
                        >
                          ✓ Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDismissSuggestion(s)}
                          className="px-2 py-1 rounded border border-[var(--cw-border)] text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] text-[11px] font-semibold hover:bg-[var(--cw-surface-muted)] transition-colors cursor-pointer"
                          title="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Matches: 1 Match or Top 3 Choices */}
          {matchSelection.matches.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
                {matchSelection.hasSingleMatch ? "Matched civic journey" : "Matching journeys (select one)"}
              </h3>

              <div
                role="radiogroup"
                aria-label="Matched civic journeys"
                className={`grid gap-3 ${matchSelection.hasMultipleMatches ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1"}`}
              >
                {matchSelection.matches.map((match) => {
                  const isSelected = matchSelection.selectedMatch?.taskId === match.taskId;
                  return (
                    <button
                      key={match.taskId}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedTaskId(match.taskId)}
                      className={`p-5 rounded-2xl border cursor-pointer transition-all text-left flex flex-col justify-between gap-4 shadow-xs ${
                        isSelected
                          ? "border-[var(--cw-brand)] bg-[var(--cw-surface)] ring-2 ring-[var(--cw-brand)]/20"
                          : "border-[var(--cw-border)] bg-[var(--cw-surface)] hover:border-[var(--cw-brand)]/50"
                      }`}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          {match.isBestMatch ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--cw-brand)] text-white">
                              Best match
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-[var(--cw-text-muted)] uppercase tracking-wider">
                              Option
                            </span>
                          )}
                          <span className="text-[11px] text-[var(--cw-text-muted)]">
                            {match.stepCount} steps
                          </span>
                        </div>
                        <h4 className="text-base font-semibold text-[var(--cw-text)] leading-snug">
                          {match.title}
                        </h4>
                        <p className="text-xs text-[var(--cw-text-muted)] line-clamp-2 leading-relaxed">
                          {match.summary}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[var(--cw-border)]/50 text-[11px] text-[var(--cw-text-muted)] w-full">
                        <span>{match.verifiedStepCount} verified</span>
                        <span className="font-semibold text-[var(--cw-brand)]">
                          {isSelected ? "Selected ✓" : "Select"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Guided questions on the landing (C3) */}
              {landingJourney && (
                <div className="flex flex-col gap-2 pt-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
                    Personalise your route
                  </h4>
                  <GuidedQuestions
                    journey={landingJourney}
                    answeredFacts={confirmedFacts}
                    onAnswer={(fact, val) => setConfirmedFacts((prev) => ({ ...prev, [fact]: val }))}
                  />
                </div>
              )}

              {/* Primary Action Button: Map my route */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  data-testid="map-my-route-btn"
                  onClick={handleMapRoute}
                  className="min-h-[50px] px-8 rounded-xl bg-[var(--cw-brand)] text-white text-sm font-semibold hover:bg-[var(--cw-brand)]/90 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <span>Map my route</span>
                  <span aria-hidden="true">&rarr;</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
