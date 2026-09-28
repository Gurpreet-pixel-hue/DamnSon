import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getJourneyRepository } from "@/lib/server/journeys";
import { loadJourneyPage } from "./loadJourneyPage";
import { JourneyShell } from "@/components/shell/JourneyShell";
import { isCopilotEnabled } from "./copilotFlag";

interface JourneyPageProps {
  params: Promise<{ taskId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ taskId: string }>;
}): Promise<Metadata> {
  const { taskId } = await params;
  const repo = getJourneyRepository();
  const result = await loadJourneyPage(repo, taskId);

  if (result.kind !== "ok") {
    return {
      title: "Journey Not Found",
    };
  }

  return {
    title: result.data.published.template.title,
    description: result.data.published.template.summary,
  };
}

export default async function JourneyPage({ params, searchParams }: JourneyPageProps) {
  const { taskId } = await params;
  const sParams = searchParams ? await searchParams : undefined;
  if (process.env.NODE_ENV !== "production" && sParams?.["error"] === "1") {
    throw new Error("Simulated repository failure: network timeout connecting to database");
  }

  const repo = getJourneyRepository();
  const result = await loadJourneyPage(repo, taskId);

  if (result.kind === "not_found") {
    notFound();
  }

  if (result.kind === "invalid") {
    throw new Error(`Invalid journey graph: ${result.issues.join(", ")}`);
  }

  // Read on the server so neither the flag's source nor the URL reaches the client bundle.
  const copilotEnabled = isCopilotEnabled(process.env["INTELLIGENCE_BASE_URL"]);

  return (
    <JourneyShell
      copilotEnabled={copilotEnabled}
      initialBundle={{
        template: result.data.published.template,
        modules: result.data.published.modules,
      }}
    />
  );
}
