import type { Answers } from "./resolvePath";
import type { CivicTaskGraph } from "./schema";
import { idSchema } from "./schema";

export interface ShareState {
  taskId: string;
  answers: Answers;
  completed: string[];
}

export function encodeShareState(s: ShareState): string {
  const params = new URLSearchParams();
  params.set("task", s.taskId);

  // Sorted question answers
  const sortedQids = Object.keys(s.answers).sort();
  if (sortedQids.length > 0) {
    const aEntries: string[] = [];
    for (const qid of sortedQids) {
      const val = s.answers[qid];
      if (val !== undefined) {
        aEntries.push(`${qid}.${val ? "y" : "n"}`);
      }
    }
    if (aEntries.length > 0) {
      params.set("a", aEntries.join(","));
    }
  }

  // Sorted completed IDs
  const sortedCompleted = [...s.completed].sort();
  if (sortedCompleted.length > 0) {
    params.set("done", sortedCompleted.join(","));
  }

  return params.toString();
}

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

  const answers: Record<string, boolean> = {};
  const rawA = params.get("a");
  if (rawA) {
    const parts = rawA.split(",");
    for (const part of parts) {
      const lastDot = part.lastIndexOf(".");
      if (lastDot === -1) continue;
      const qid = part.slice(0, lastDot);
      const valCode = part.slice(lastDot + 1);
      if (valCode !== "y" && valCode !== "n") continue;
      if (!idSchema.safeParse(qid).success) continue;
      answers[qid] = valCode === "y";
    }
  }

  const completed: string[] = [];
  const rawDone = params.get("done");
  if (rawDone) {
    const ids = rawDone.split(",");
    for (const id of ids) {
      if (idSchema.safeParse(id).success) {
        completed.push(id);
      }
    }
  }

  return {
    taskId,
    answers,
    completed,
  };
}

export function sanitizeShareState(
  s: ShareState,
  graph: CivicTaskGraph
): ShareState {
  const validQuestionIds = new Set(graph.questions.map((q) => q.id));
  const validNodeIds = new Set(graph.nodes.map((n) => n.id));

  const sanitizedAnswers: Record<string, boolean> = {};
  for (const [qid, val] of Object.entries(s.answers)) {
    if (validQuestionIds.has(qid)) {
      sanitizedAnswers[qid] = val;
    }
  }

  const sanitizedCompleted = s.completed.filter((id) => validNodeIds.has(id));

  return {
    taskId: s.taskId,
    answers: sanitizedAnswers,
    completed: sanitizedCompleted,
  };
}
