import fs from "node:fs";
import path from "node:path";
import { civicTaskGraphSchema, type CivicTaskGraph } from "@/lib/graph/schema";
import { analyzeGraph } from "@/lib/graph/analyzeGraph";
import { graphRepository } from "@/lib/data/graphRepository";

export async function loadGraphForPage(
  searchParams?: { [key: string]: string | string[] | undefined }
): Promise<CivicTaskGraph | null> {
  const isDev = process.env.NODE_ENV !== "production";
  const graphParam = searchParams?.["graph"];

  // In development only, /?graph=stress loads stress-25.json
  if (isDev && graphParam === "stress") {
    try {
      const stressPath = path.join(
        process.cwd(),
        "data/fixtures/stress/stress-25.json"
      );
      if (fs.existsSync(stressPath)) {
        const raw = JSON.parse(fs.readFileSync(stressPath, "utf8"));
        const parseResult = civicTaskGraphSchema.safeParse(raw);
        if (!parseResult.success) {
          console.error(
            "[loadGraph] stress fixture zod validation failed:",
            parseResult.error.issues
          );
        } else {
          const analysis = analyzeGraph(parseResult.data);
          if (analysis.ok) {
            return parseResult.data;
          } else {
            console.error(
              "[loadGraph] stress fixture analyzeGraph failed:",
              analysis.issues.map((i) => i.code)
            );
          }
        }
      } else {
        console.error(`[loadGraph] stress fixture not found at ${stressPath}`);
      }
    } catch (err) {
      console.error("[loadGraph] error loading stress fixture:", err);
      // Fall through to repository if stress fixture fails
    }
  }

  // Otherwise, read default graph from repository
  try {
    const tasks = await graphRepository.listTasks();
    const firstTask = tasks[0];
    if (firstTask) {
      return await graphRepository.getGraph(firstTask.taskId);
    }
  } catch {
    // Unset DATA_SOURCE in build/prod will gracefully catch and return null
  }

  return null;
}
