export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#09090b] p-8 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Admin — Journey Management
          </h1>
          <p className="text-sm text-zinc-400">
            Author, review and verify municipal journey templates and approval modules.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-950/80 p-8 text-center text-sm text-zinc-500 backdrop-blur-md">
          Admin authoring UI will be migrated in FE-7.
        </div>
      </div>
    </div>
  );
}
