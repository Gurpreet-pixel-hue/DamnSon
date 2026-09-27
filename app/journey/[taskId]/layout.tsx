import "server-only";
import { notFound } from "next/navigation";
import { getJourneyRepository } from "@/lib/server/journeys";

interface JourneyLayoutProps {
  params: Promise<{ taskId: string }>;
  children: React.ReactNode;
}

export default async function JourneyLayout({ params, children }: JourneyLayoutProps) {
  const { taskId } = await params;
  const repo = getJourneyRepository();
  const published = await repo.getPublishedJourney(taskId);
  if (!published) {
    notFound();
  }
  return <>{children}</>;
}
