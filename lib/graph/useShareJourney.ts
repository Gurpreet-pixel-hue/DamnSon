"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { ComposedJourney } from "@/lib/contract/compose";
import { useTaskStore } from "@/lib/store/useTaskStore";
import {
  encodeShareState,
  decodeShareState,
  sanitizeShareState,
  areShareStatesEqual,
  isLocalStateEmpty,
  type ShareState,
} from "./shareState";

export interface UseShareJourneyResult {
  copied: boolean;
  conflictSharedState: ShareState | null;
  shareLink: () => Promise<string | null>;
  applyShared: () => void;
  keepMine: () => void;
}

export function useShareJourney(
  taskId: string,
  journey?: ComposedJourney
): UseShareJourneyResult {
  const [copied, setCopied] = useState(false);
  const [conflictSharedState, setConflictSharedState] = useState<ShareState | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const checkedParamsRef = useRef(false);

  // Generate share link and copy to clipboard
  const shareLink = useCallback(async (): Promise<string | null> => {
    if (typeof window === "undefined" || !taskId) return null;

    const state = useTaskStore.getState();
    const facts = state.factsByTask[taskId] ?? {};
    const completed = state.completedByTask[taskId] ?? [];

    const shareState: ShareState = {
      taskId,
      facts,
      completed,
    };

    const sanitized = journey ? sanitizeShareState(shareState, journey) : shareState;
    const query = encodeShareState(sanitized);
    const url = `${window.location.origin}/journey/${taskId}?${query}`;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2500);
      return url;
    } catch {
      return url;
    }
  }, [taskId, journey]);

  // Apply shared link state
  const applyShared = useCallback(() => {
    if (!conflictSharedState || !taskId) return;

    useTaskStore.getState().setFacts(taskId, conflictSharedState.facts);
    useTaskStore.getState().setCompleted(taskId, conflictSharedState.completed);
    setConflictSharedState(null);

    if (typeof window !== "undefined") {
      history.replaceState(null, "", window.location.pathname);
    }
  }, [conflictSharedState, taskId]);

  // Keep local state and dismiss banner
  const keepMine = useCallback(() => {
    setConflictSharedState(null);

    if (typeof window !== "undefined") {
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Conflict resolution and incoming share URL handling after hydration (P3 & P4)
  useEffect(() => {
    if (typeof window === "undefined" || !taskId || !journey || checkedParamsRef.current) {
      return;
    }

    const checkIncomingShare = () => {
      const search = window.location.search;
      if (!search || (!search.includes("task=") && !search.includes("f=") && !search.includes("done="))) {
        return;
      }

      checkedParamsRef.current = true;
      const params = new URLSearchParams(search);
      const decoded = decodeShareState(params);
      if (!decoded || decoded.taskId !== taskId) {
        return;
      }

      const sanitizedShared = sanitizeShareState(decoded, journey);
      const state = useTaskStore.getState();
      const localFacts = state.factsByTask[taskId] ?? {};
      const localCompleted = state.completedByTask[taskId] ?? [];
      const localState: ShareState = {
        taskId,
        facts: localFacts,
        completed: localCompleted,
      };
      const sanitizedLocal = sanitizeShareState(localState, journey);

      if (isLocalStateEmpty(sanitizedLocal)) {
        // Local has no progress: apply shared automatically without conflict
        state.setFacts(taskId, sanitizedShared.facts);
        state.setCompleted(taskId, sanitizedShared.completed);
        history.replaceState(null, "", window.location.pathname);
      } else if (areShareStatesEqual(sanitizedLocal, sanitizedShared)) {
        // Both states identical: silently clear params
        history.replaceState(null, "", window.location.pathname);
      } else {
        // Conflict detected: show banner
        setConflictSharedState(sanitizedShared);
      }
    };

    if (useTaskStore.persist.hasHydrated()) {
      checkIncomingShare();
    } else {
      const unsub = useTaskStore.persist.onFinishHydration(() => {
        checkIncomingShare();
      });
      void useTaskStore.persist.rehydrate();
      return unsub;
    }
  }, [taskId, journey]);

  return {
    copied,
    conflictSharedState,
    shareLink,
    applyShared,
    keepMine,
  };
}
