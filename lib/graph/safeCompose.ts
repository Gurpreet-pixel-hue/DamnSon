import {
  composeJourney,
  ComposeError,
  type ComposedJourney,
} from "@/lib/contract/compose";
import { analyzeJourney, type GraphIssue } from "@/lib/contract/analyze";
import type { ApprovalModule, JourneyTemplate } from "@/lib/contract/schema";
import type { Facts } from "@/lib/contract/facts";

export type SafeComposeResult =
  | { ok: true; journey: ComposedJourney }
  | { ok: false; codes: string[]; message?: string; issues?: GraphIssue[] };

export function safeCompose(
  template: JourneyTemplate,
  modules: readonly ApprovalModule[],
  facts: Facts,
  opts?: { maximal?: boolean }
): SafeComposeResult {
  try {
    const journey = composeJourney(template, modules, facts, opts);
    const analysis = analyzeJourney(journey);
    if (!analysis.ok) {
      return {
        ok: false,
        codes: analysis.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.code),
        issues: analysis.issues,
      };
    }
    return { ok: true, journey };
  } catch (err) {
    if (err instanceof ComposeError) {
      return { ok: false, codes: ["COMPOSE_ERROR"], message: err.message };
    }
    if (err instanceof Error) {
      return { ok: false, codes: ["UNEXPECTED_ERROR"], message: err.message };
    }
    return { ok: false, codes: ["UNEXPECTED_ERROR"], message: String(err) };
  }
}
