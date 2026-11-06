/** Instant shells that mirror each section's real layout while its data loads. */

function PageHead({ wide = false }: { wide?: boolean }) {
  return (
    <div className="stack-sm">
      <div className="skeleton skeleton-title" />
      <div
        className="skeleton skeleton-line"
        style={wide ? undefined : { width: "min(420px, 80%)" }}
      />
    </div>
  );
}

function GridRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="skeleton-grid-rows" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton skeleton-grid-row" />
      ))}
    </div>
  );
}

/** /app — KPI cards + recent list + side stack. */
export function OverviewSkeleton() {
  return (
    <div className="app-page" aria-busy="true" aria-label="Loading overview">
      <div className="page-head">
        <PageHead />
        <div className="skeleton skeleton-btn" />
      </div>
      <div className="kpi-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="skeleton skeleton-card" />
        ))}
      </div>
      <div className="dash-grid">
        <div className="skeleton skeleton-panel skeleton-panel--list" />
        <div className="stack-lg">
          <div className="skeleton skeleton-panel skeleton-panel--side" />
          <div className="skeleton skeleton-panel skeleton-panel--side" />
        </div>
      </div>
    </div>
  );
}

/** /app/purchases — filter pills + search + table rows. */
export function PurchasesSkeleton() {
  return (
    <div className="app-page" aria-busy="true" aria-label="Loading purchases">
      <div className="page-head">
        <PageHead />
        <div className="skeleton-segmented" aria-hidden>
          <div className="skeleton skeleton-pill" />
          <div className="skeleton skeleton-pill" />
          <div className="skeleton skeleton-pill" />
        </div>
      </div>
      <section className="card grid-card stack-flush">
        <div className="grid-toolbar">
          <div className="skeleton skeleton-search" />
        </div>
        <div className="skeleton-grid-head" aria-hidden>
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="skeleton skeleton-grid-cell" />
          ))}
        </div>
        <GridRows rows={10} />
        <div className="grid-footer">
          <div className="skeleton skeleton-line" style={{ width: 160 }} />
        </div>
      </section>
    </div>
  );
}

/** /app/purchases/[id] — back link + detail stack. */
export function PurchaseDetailSkeleton() {
  return (
    <div className="app-page" aria-busy="true" aria-label="Loading purchase">
      <div className="skeleton skeleton-line" style={{ width: 120 }} />
      <div className="stack-sm" style={{ marginTop: 12 }}>
        <div className="skeleton skeleton-title" style={{ height: 36 }} />
        <div
          className="skeleton skeleton-line"
          style={{ width: "min(280px, 60%)" }}
        />
      </div>
      <div className="skeleton skeleton-panel" style={{ height: 220 }} />
      <div className="skeleton skeleton-panel" style={{ height: 160 }} />
    </div>
  );
}

/** /app/approvals — stacked review rows. */
export function ApprovalsSkeleton() {
  return (
    <div className="app-page" aria-busy="true" aria-label="Loading approvals">
      <PageHead />
      <section className="card list-card">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="skeleton-approval-row" aria-hidden>
            <div className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
              <div
                className="skeleton skeleton-line"
                style={{ width: "55%" }}
              />
              <div
                className="skeleton skeleton-line"
                style={{ width: "80%", height: 12 }}
              />
              <div
                className="skeleton skeleton-line"
                style={{ width: "30%", height: 10 }}
              />
            </div>
            <div
              className="skeleton skeleton-line skeleton-approval-chip"
              style={{ width: 72, height: 18 }}
            />
            <div className="skeleton skeleton-btn skeleton-approval-act" />
          </div>
        ))}
      </section>
    </div>
  );
}

/** /app/agent — chat thread + compose. */
export function AgentSkeleton() {
  return (
    <div className="app-page" aria-busy="true" aria-label="Loading agent">
      <PageHead />
      <div className="card skeleton-agent-chat">
        <div className="skeleton-agent-thread">
          <div
            className="skeleton skeleton-line"
            style={{ width: "70%", height: 12 }}
          />
          <div className="skeleton skeleton-compose" style={{ height: 72 }} />
          <div
            className="skeleton skeleton-compose"
            style={{ height: 56, width: "55%", alignSelf: "flex-end" }}
          />
        </div>
        <div className="skeleton-agent-compose">
          <div
            className="skeleton skeleton-line"
            style={{ width: 140, height: 12 }}
          />
          <div className="skeleton skeleton-compose" />
          <div
            className="skeleton skeleton-btn"
            style={{ alignSelf: "flex-end" }}
          />
        </div>
      </div>
    </div>
  );
}

/** /app/rules — form blocks. */
export function RulesSkeleton() {
  return (
    <div className="app-page" aria-busy="true" aria-label="Loading rules">
      <div className="rules-form stack-lg">
        <PageHead />
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="card stack-card" style={{ gap: 14 }}>
            <div
              className="skeleton skeleton-line"
              style={{ width: 160, height: 18 }}
            />
            <div
              className="skeleton skeleton-line"
              style={{ width: "100%", height: 40 }}
            />
            <div
              className="skeleton skeleton-line"
              style={{ width: "100%", height: 40 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** /app/calendar — week board. */
export function CalendarSkeleton() {
  return (
    <div className="app-page" aria-busy="true" aria-label="Loading calendar">
      <PageHead />
      <div className="skeleton skeleton-panel skeleton-panel--calendar" />
    </div>
  );
}

/** /app/activity — filter + log table. */
export function ActivitySkeleton() {
  return (
    <div className="app-page" aria-busy="true" aria-label="Loading activity">
      <PageHead />
      <section className="card grid-card stack-flush">
        <div className="grid-toolbar">
          <div className="skeleton-segmented" aria-hidden>
            <div className="skeleton skeleton-pill" />
            <div className="skeleton skeleton-pill" />
            <div className="skeleton skeleton-pill" />
            <div className="skeleton skeleton-pill" />
          </div>
        </div>
        <GridRows rows={10} />
      </section>
    </div>
  );
}

/** /app/settings — stacked setting cards. */
export function SettingsSkeleton() {
  return (
    <div className="app-page" aria-busy="true" aria-label="Loading settings">
      <PageHead />
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="skeleton skeleton-panel"
          style={{ height: 140 }}
        />
      ))}
    </div>
  );
}
