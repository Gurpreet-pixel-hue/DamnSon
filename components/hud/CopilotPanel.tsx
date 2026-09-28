"use client";

import React, { useState, useRef, useEffect } from "react";
import { copilotResponseSchema } from "@/lib/contract/api";
import { isOfficialUrl } from "@/lib/contract/officialSources";

export interface CopilotPanelProps {
  taskId: string;
  stepId: string;
  stepTitle?: string;
}

type CopilotData = ReturnType<typeof copilotResponseSchema.parse>;

export function CopilotPanel({ taskId, stepId, stepTitle }: CopilotPanelProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopilotData | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clear state when step changes
  useEffect(() => {
    setQuestion("");
    setError(null);
    setResult(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [stepId, taskId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/v1/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          stepId,
          question: trimmed,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          setError("Too many questions. Please try again in a moment.");
        } else {
          setError(
            "Couldn't reach the assistant right now. Please verify requirements directly with the official sources."
          );
        }
        return;
      }

      const json = await response.json();
      const parsed = copilotResponseSchema.safeParse(json);
      if (parsed.success) {
        setResult(parsed.data);
      } else {
        setError(
          "Received an unrecognised response format from the assistant."
        );
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        setError("The assistant took too long to respond (25s timeout).");
      } else {
        setError(
          "The assistant is currently offline or unreachable. Please consult the official sources."
        );
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-[var(--cw-border)] bg-[var(--cw-surface-muted)]/25 p-3.5 text-xs text-[var(--cw-text)]"
      data-testid="copilot-panel"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
          Ask about this step
        </h4>
        <span className="text-[10px] text-[var(--cw-text-muted)]">
          Official sources only
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="relative flex items-center">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              stepTitle
                ? `Ask a question about ${stepTitle.slice(0, 30)}...`
                : "Ask about documents, timeline, or fees..."
            }
            disabled={loading}
            maxLength={300}
            className="w-full rounded-lg border border-[var(--cw-border)] bg-[var(--cw-surface)] px-3 py-2 text-xs text-[var(--cw-text)] placeholder:text-[var(--cw-text-muted)] focus:border-[var(--cw-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--cw-focus)] disabled:opacity-60"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-lg bg-[var(--cw-accent)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cw-focus)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Searching sources..." : "Ask assistant"}
          </button>
        </div>
      </form>

      {error && (
        <div
          className="rounded-lg border border-[var(--cw-border)] bg-[var(--cw-surface)] p-3 text-[11px] text-[var(--cw-text-muted)] leading-relaxed"
          role="alert"
        >
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--cw-border)] bg-[var(--cw-surface)] p-3 text-xs">
          {result.answer ? (
            <div className="text-[12px] leading-relaxed text-[var(--cw-text)] whitespace-pre-wrap">
              {result.answer}
            </div>
          ) : (
            <div className="text-[11px] text-[var(--cw-text-muted)] italic">
              Couldn&apos;t find an exact answer in the verified official sources.
            </div>
          )}

          {result.citations.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-[var(--cw-border)] pt-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
                Cited sources ({result.citations.length})
              </span>
              <ul className="flex flex-col gap-1.5">
                {result.citations.map((citation) => {
                  const isOfficial = citation.official || isOfficialUrl(citation.url);
                  return (
                    <li key={citation.chunkId} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-[var(--cw-text-muted)]">
                          [{citation.n}]
                        </span>
                        <a
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[var(--cw-accent)] underline hover:opacity-80"
                        >
                          {citation.title}
                        </a>
                        {isOfficial && (
                          <span className="rounded bg-[var(--cw-available)]/15 px-1 py-0.2 text-[9px] font-semibold text-[var(--cw-available)]">
                            Official
                          </span>
                        )}
                      </div>
                      {citation.quote && (
                        <blockquote className="text-[10px] text-[var(--cw-text-muted)] italic pl-3 border-l-2 border-[var(--cw-border)]">
                          &ldquo;{citation.quote}&rdquo;
                        </blockquote>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {result.passages && result.passages.length > 0 && !result.answer && (
            <div className="flex flex-col gap-1.5 border-t border-[var(--cw-border)] pt-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
                Relevant passages from sources
              </span>
              <div className="flex flex-col gap-2">
                {result.passages.map((p, idx) => (
                  <div
                    key={idx}
                    className="rounded border border-[var(--cw-border)] p-2 text-[11px] text-[var(--cw-text-muted)]"
                  >
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[var(--cw-accent)] underline block mb-1"
                    >
                      {p.title}
                    </a>
                    <p className="leading-snug">{p.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
