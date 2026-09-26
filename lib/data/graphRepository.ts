import fs from "node:fs";
import path from "node:path";
import {
  civicTaskGraphSchema,
  type CivicTaskGraph,
  type Category,
} from "@/lib/graph/schema";
import { analyzeGraph } from "@/lib/graph/analyzeGraph";

export interface TaskSummary {
  taskId: string;
  title: string;
  summary: string;
  category: Category;
  city: string;
  keywords: string[];
  stepCount: number;
  verifiedStepCount: number;
  synthetic: boolean;
}

export interface GraphRepositoryOptions {
  seedDir: string;
  demoDir: string;
  dataSource?: string;
  nodeEnv?: string;
}

export interface GraphRepository {
  listTasks(): Promise<TaskSummary[]>;
  getGraph(taskId: string): Promise<CivicTaskGraph | null>;
}

export function createGraphRepository(
  options: GraphRepositoryOptions
): GraphRepository {
  const { seedDir, demoDir, dataSource, nodeEnv } = options;

  if (nodeEnv === "production" && dataSource === "fixtures") {
    throw new Error(
      "Cannot use fixtures data source in production environment"
    );
  }

  async function loadAll(): Promise<{
    summaries: TaskSummary[];
    graphMap: Map<string, CivicTaskGraph>;
  }> {
    const summaries: TaskSummary[] = [];
    const graphMap = new Map<string, CivicTaskGraph>();
    const seenTaskIds = new Set<string>();

    const dirsToRead: Array<{ dir: string; isSynthetic: boolean }> = [
      { dir: seedDir, isSynthetic: false },
    ];

    if (dataSource === "fixtures") {
      dirsToRead.push({ dir: demoDir, isSynthetic: true });
    }

    for (const { dir, isSynthetic } of dirsToRead) {
      if (!fs.existsSync(dir)) continue;

      let fileNames: string[] = [];
      try {
        fileNames = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
      } catch (err) {
        console.error(`Error reading directory ${dir}:`, err);
        continue;
      }

      for (const fileName of fileNames) {
        const filePath = path.join(dir, fileName);
        let rawContent: unknown;
        try {
          rawContent = JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (err) {
          console.error(`Invalid JSON in ${fileName}:`, err);
          continue;
        }

        const parsed = civicTaskGraphSchema.safeParse(rawContent);
        if (!parsed.success) {
          console.error(
            `Schema validation failed for ${fileName}:`,
            parsed.error.issues.map((i) => i.message).join(", ")
          );
          continue;
        }

        const graph = parsed.data;
        const analysis = analyzeGraph(graph);
        if (!analysis.ok) {
          const issueCodes = analysis.issues
            .filter((i) => i.severity === "error")
            .map((i) => i.code)
            .join(", ");
          console.error(
            `Graph integrity check failed for ${fileName}: issues [${issueCodes}]`
          );
          continue;
        }

        if (seenTaskIds.has(graph.taskId)) {
          console.error(
            `Duplicate taskId detected in ${fileName}: ${graph.taskId}`
          );
          continue;
        }

        seenTaskIds.add(graph.taskId);
        graphMap.set(graph.taskId, graph);

        const verifiedStepCount = graph.nodes.filter(
          (n) => n.review.status === "verified"
        ).length;

        summaries.push({
          taskId: graph.taskId,
          title: graph.title,
          summary: graph.summary,
          category: graph.category,
          city: graph.jurisdiction.city,
          keywords: graph.keywords,
          stepCount: graph.nodes.length,
          verifiedStepCount,
          synthetic: isSynthetic,
        });
      }
    }

    return { summaries, graphMap };
  }

  return {
    async listTasks(): Promise<TaskSummary[]> {
      const { summaries } = await loadAll();
      return summaries;
    },

    async getGraph(taskId: string): Promise<CivicTaskGraph | null> {
      const { graphMap } = await loadAll();
      return graphMap.get(taskId) ?? null;
    },
  };
}

export const graphRepository = createGraphRepository({
  seedDir: path.join(process.cwd(), "data/seed"),
  demoDir: path.join(process.cwd(), "data/fixtures/demo"),
  dataSource: process.env["DATA_SOURCE"],
  nodeEnv: process.env["NODE_ENV"],
});
