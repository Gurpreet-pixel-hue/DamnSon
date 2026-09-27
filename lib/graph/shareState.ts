import { z } from "zod";
import { idSchema } from "@/lib/contract/schema";
import { parseFacts, type FactKey, type Facts } from "@/lib/contract/facts";
import type { ComposedJourney } from "@/lib/contract/compose";

export interface ShareState {
  taskId: string;
  facts: Facts;
  completed: string[];
}

function toBase64Url(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf8").toString("base64url");
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64url, "base64url").toString("utf8");
  }
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (b64url.length % 4)) % 4);
  return atob(b64);
}

export function encodeShareState(s: ShareState): string {
  const params = new URLSearchParams();
  params.set("task", s.taskId);

  // Sorted facts JSON encoded as base64url
  const sortedFactKeys = Object.keys(s.facts).sort() as FactKey[];
  if (sortedFactKeys.length > 0) {
    const sortedFacts: Record<string, unknown> = {};
    for (const key of sortedFactKeys) {
      if (s.facts[key] !== undefined) {
        sortedFacts[key] = s.facts[key];
      }
    }
    const jsonStr = JSON.stringify(sortedFacts);
    params.set("f", toBase64Url(jsonStr));
  }

  // Sorted completed IDs
  const sortedCompleted = [...s.completed].sort();
  if (sortedCompleted.length > 0) {
    params.set("done", sortedCompleted.join(","));
  }

  return params.toString();
}

const stepIdSchema = z.string().min(2).max(128).regex(/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/);

export function decodeShareState(params: URLSearchParams): ShareState | null {
  const rawTask = params.get("task");
  if (!rawTask) {
    return null;
  }

  const taskParsed = idSchema.safeParse(rawTask);
  if (!taskParsed.success) {
    return null;
  }
  const taskId = taskParsed.data;

  let facts: Facts = {};
  const rawF = params.get("f");
  if (rawF) {
    try {
      const decodedJson = fromBase64Url(rawF);
      const parsed = JSON.parse(decodedJson);
      facts = parseFacts(parsed);
    } catch {
      facts = {};
    }
  }

  const completed: string[] = [];
  const rawDone = params.get("done");
  if (rawDone) {
    const ids = rawDone.split(",");
    for (const id of ids) {
      if (stepIdSchema.safeParse(id).success) {
        completed.push(id);
      }
    }
  }

  return {
    taskId,
    facts,
    completed,
  };
}

export function sanitizeShareState(
  s: ShareState,
  journey: ComposedJourney
): ShareState {
  // Drops ids that aren't in the journey and drops milestone ids
  const validActionNodeIds = new Set(
    journey.steps
      .filter((step) => step.kind !== "milestone")
      .map((step) => step.id)
  );

  const sanitizedCompleted = s.completed.filter((id) =>
    validActionNodeIds.has(id)
  );
  const sanitizedFacts = parseFacts(s.facts);

  return {
    taskId: s.taskId,
    facts: sanitizedFacts,
    completed: sanitizedCompleted,
  };
}

/**
 * Canonical comparison of two share states (P4).
 * Sorts facts keys and clones completed ids before sorting (never mutates input arrays).
 */
export function areShareStatesEqual(a: ShareState, b: ShareState): boolean {
  if (a.taskId !== b.taskId) return false;

  const aKeys = Object.keys(a.facts).sort();
  const bKeys = Object.keys(b.facts).sort();
  if (aKeys.length !== bKeys.length) return false;

  for (let i = 0; i < aKeys.length; i++) {
    const k = aKeys[i]!;
    if (k !== bKeys[i]) return false;
    if (a.facts[k as FactKey] !== b.facts[k as FactKey]) return false;
  }

  // Sorted copy of completed IDs (no mutation)
  const aCompleted = [...a.completed].sort();
  const bCompleted = [...b.completed].sort();
  if (aCompleted.length !== bCompleted.length) return false;

  for (let i = 0; i < aCompleted.length; i++) {
    if (aCompleted[i] !== bCompleted[i]) return false;
  }

  return true;
}

/**
 * Checks if a local state has no progress (no facts and no completed steps) (P3 & P4).
 */
export function isLocalStateEmpty(state: { facts?: Facts; completed?: string[] }): boolean {
  const factKeys = state.facts ? Object.keys(state.facts) : [];
  const completedCount = state.completed?.length ?? 0;
  return factKeys.length === 0 && completedCount === 0;
}

