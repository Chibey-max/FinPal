// Shown while the dashboard's server data loads.
export default function DashboardLoading() {
  return (
    <main
      className="grid gap-6"
      aria-busy="true"
      aria-label="Loading decisions"
    >
      <div className="grid gap-2">
        <div className="bg-muted h-7 w-40 animate-pulse rounded" />
        <div className="bg-muted h-4 w-96 max-w-full animate-pulse rounded" />
      </div>
      <div className="flex gap-3">
        <div className="bg-muted h-9 w-64 animate-pulse rounded-md" />
        <div className="bg-muted h-9 w-72 animate-pulse rounded-md" />
      </div>
      <div className="grid gap-2 rounded-md border p-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="bg-muted h-8 animate-pulse rounded" />
        ))}
      </div>
    </main>
  );
}
