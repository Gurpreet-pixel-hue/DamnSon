import { ExplorerShell } from "@/components/explorer/ExplorerShell";
import { loadGraphForPage } from "./loadGraph";

interface PageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function HomePage(props: PageProps) {
  const resolvedSearchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const initialGraph = await loadGraphForPage(resolvedSearchParams);

  return <ExplorerShell initialGraph={initialGraph} />;
}
