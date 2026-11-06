export default function SendLoading() {
  return (
    <div className="app-page">
      <div className="page-head__text">
        <div className="skeleton" style={{ height: 28, width: 100 }} />
        <div
          className="skeleton"
          style={{ height: 16, width: "min(480px, 90%)", marginTop: 10 }}
        />
      </div>
      <div className="send-layout" style={{ marginTop: 20 }} aria-hidden>
        <div className="skeleton" style={{ height: 360, borderRadius: 16 }} />
        <div className="stack-lg">
          <div className="skeleton" style={{ height: 180, borderRadius: 16 }} />
          <div className="skeleton" style={{ height: 220, borderRadius: 16 }} />
        </div>
      </div>
    </div>
  );
}
