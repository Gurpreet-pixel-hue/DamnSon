import { ExplorerShell } from "@/components/explorer/ExplorerShell";
import { loadJourneyForPage } from "./loadJourney";

interface PageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function HomePage(props: PageProps) {
  const resolvedSearchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const initialBundle = await loadJourneyForPage(resolvedSearchParams);

  return <ExplorerShell initialBundle={initialBundle} />;
}
