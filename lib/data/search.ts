import type { TaskSummary } from "./graphRepository";

export function searchTasks(
  tasks: TaskSummary[],
  query: string,
  limit = 8
): TaskSummary[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) {
    return [];
  }

  const scored: Array<{ task: TaskSummary; score: number }> = [];

  for (const task of tasks) {
    let score = 0;
    const titleWords = task.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const summaryLower = task.summary.toLowerCase();
    const keywordsLower = task.keywords.map((k) => k.toLowerCase());

    for (const token of tokens) {
      if (titleWords.some((w) => w.startsWith(token))) {
        score += 3;
      }
      if (keywordsLower.some((k) => k.includes(token))) {
        score += 2;
      }
      if (summaryLower.includes(token)) {
        score += 1;
      }
    }

    if (score > 0) {
      scored.push({ task, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.task.title.localeCompare(b.task.title);
  });

  return scored.slice(0, limit).map((s) => s.task);
}
