"use client";

import React, { useMemo } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import { isOfficialUrl } from "@/lib/contract/officialSources";
import { explainStep, type LinkedStep } from "@/lib/graph/stepExplain";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { useViewStore } from "@/lib/store/useViewStore";

export interface StepExplainProps {
  journey: ComposedJourney;
  stepId: string;
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-text-muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function StepLinks({ items, empty }: { items: LinkedStep[]; empty: string }) {
  const selectStep = useTaskStore((s) => s.selectStep);
  const setFocusedStepId = useViewStore((s) => s.setFocusedStepId);

  if (items.length === 0)
    return <p className="text-xs text-[var(--cw-text-muted)]">{empty}</p>;

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="text-xs">
          <button
            type="button"
            onClick={() => {
              selectStep(item.id);
              setFocusedStepId(item.id);
            }}
            className="text-left font-medium text-[var(--cw-text)] underline decoration-[var(--cw-border)] underline-offset-2 hover:decoration-[var(--cw-text)] cursor-pointer"
          >
            {item.title}
          </button>
          {item.kind === "recommended_after" && (
            <span className="ml-1 text-[10px] text-[var(--cw-text-muted)]">
              (suggested order, not required)
            </span>
          )}
          {item.note && (
            <span className="block text-[11px] text-[var(--cw-text-muted)]">
              {item.note}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const APPLICABILITY_TEXT = {
  applies: "Applies to you",
  may_apply: "May apply: depends on an answer you haven't given yet",
  optional: "Optional: you chose it, or it's recommended but not required",
} as const;

/** "Why is this step here?": reasons, dependencies, what it unlocks and its official sources (deterministic, B4). */
export function StepExplain({ journey, stepId }: StepExplainProps) {
  const explanation = useMemo(
    () => explainStep(journey, stepId),
    [journey, stepId]
  );
  const step = journey.steps.find((s) => s.id === stepId);
  if (!explanation || !step) return null;
  const action = step.kind !== "milestone" ? step : null;

  return (
    <div
      data-testid="step-explain"
      className="flex flex-col gap-4 mt-3 pt-3 border-t border-[var(--cw-border)]/60"
    >
      <Block title="Why it's on your map">
        <p className="text-xs font-semibold text-[var(--cw-text)]">
          {APPLICABILITY_TEXT[explanation.applicability]}
        </p>
        {explanation.appliesBecause.length > 0 ? (
          <ul className="list-disc pl-4 text-xs text-[var(--cw-text-muted)]">
            {explanation.appliesBecause.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--cw-text-muted)]">
            Required for everyone on this journey.
          </p>
        )}
      </Block>

      <Block title="Depends on">
        <StepLinks
          items={explanation.dependsOn}
          empty="Nothing: you can start this step now."
        />
      </Block>

      <Block title="Unlocks">
        <StepLinks
          items={explanation.unlocks}
          empty="Nothing depends on this step."
        />
      </Block>

      {action && action.outputs.length > 0 && (
        <Block title="You get">
          <ul className="list-disc pl-4 text-xs text-[var(--cw-text)]">
            {action.outputs.map((o) => (
              <li key={o.documentTypeId}>{o.name}</li>
            ))}
          </ul>
        </Block>
      )}

      {action && (
        <Block title="Official sources">
          {action.sources.length === 0 ? (
            <p className="text-xs text-[var(--cw-text-muted)]">
              No source listed: treat this step as not verified.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {action.sources.map((src) => {
                let hostname = "";
                try {
                  hostname = new URL(src.url).hostname;
                } catch {
                  hostname = src.url;
                }
                const official = isOfficialUrl(src.url);
                return (
                  <li key={src.id} className="text-xs">
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[var(--cw-brand)] underline underline-offset-2"
                    >
                      {src.title}
                    </a>
                    <span className="block text-[10px] text-[var(--cw-text-muted)]">
                      {official ? (
                        <span className="font-semibold text-emerald-700">Official</span>
                      ) : (
                        "Unofficial source"
                      )}{" "}
                      · {hostname} · retrieved {src.retrievedOn}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {action.review.status !== "unverified" && action.review.note && (
            <p className="text-[11px] text-[var(--cw-text-muted)] rounded-lg bg-[var(--cw-surface)] border border-[var(--cw-border)] px-2 py-1.5">
              {action.review.status === "verified"
                ? `Verified ${action.review.verifiedOn}: `
                : "Flagged: "}
              {action.review.note}
            </p>
          )}
        </Block>
      )}
    </div>
  );
}
