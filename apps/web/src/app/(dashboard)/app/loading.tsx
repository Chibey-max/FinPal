// Instant shell while a section's server data loads.
export default function AppLoading() {
  return (
    <div className="app-page" aria-busy="true" aria-label="Loading">
      <div className="stack-sm">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
      </div>
      <div className="kpi-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="skeleton skeleton-card" />
        ))}
      </div>
      <div className="skeleton skeleton-panel" />
    </div>
  );
}
