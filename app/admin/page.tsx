import { GraphEditorTable } from "@/components/admin/GraphEditorTable";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#09090b] p-8 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Admin — graph review
          </h1>
          <p className="text-sm text-zinc-400">
            Review and verify municipal procedure dependency graphs.
          </p>
        </div>
        <GraphEditorTable />
      </div>
    </div>
  );
}
