import Link from "next/link";

import { ForecastCard } from "@/features/agent/forecast-card";
import { FlashToast } from "@/components/toast";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import {
  formatMoney,
  isOpenPayment,
  nextPaymentStep,
  outcomeTone,
  paymentTone,
  percentOf,
  scoreLabel,
  scoreTone,
  type Tone,
} from "@/features/app/present";
import { requireUser } from "@/lib/auth";
import {
  getSpendSummary,
  getUserConstraints,
  getDecisionRows,
} from "@/lib/backend";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const user = await requireUser();
  const { password } = await searchParams;
  const constraints = await getUserConstraints(user.id);
  const [rows, spend] = await Promise.all([
    getDecisionRows(user.id),
    getSpendSummary(user.id, constraints),
  ]);

  const count = (outcome: string) =>
    rows.filter((row) => row.outcome === outcome).length;
  const pending = rows.filter(
    (row) => row.outcome === "MANUAL_REVIEW" && row.reviewStatus === null,
  );
  const openPayments = rows.filter((row) => isOpenPayment(row.paymentStatus));
  const caps = constraints?.amountCaps;
  const currency = spend.currency;

  const kpis: {
    label: string;
    value: string;
    sub: string;
    percent: number;
    tone: Tone;
  }[] = [
    {
      label: "Spent today",
      value: formatMoney(spend.spentToday, currency),
      sub: caps?.daily
        ? `of ${formatMoney(caps.daily, currency)} daily cap`
        : "no daily cap set",
      percent: percentOf(spend.spentToday, caps?.daily),
      tone: "ok",
    },
    {
      label: "This month",
      value: formatMoney(spend.spentThisMonth, currency),
      sub: caps?.monthly
        ? `of ${formatMoney(caps.monthly, currency)} monthly cap`
        : "no monthly cap set",
      percent: percentOf(spend.spentThisMonth, caps?.monthly),
      tone: "ok",
    },
    {
      label: "Decisions",
      value: String(rows.length),
      sub: `${count("AUTO_APPROVE")} auto · ${count("MANUAL_REVIEW")} review · ${count("BLOCK")} blocked`,
      percent: percentOf(count("AUTO_APPROVE"), rows.length),
      tone: "muted",
    },
    {
      label: "Open payments",
      value: String(openPayments.length),
      sub: openPayments.length ? "awaiting PayPal steps" : "all settled",
      percent: percentOf(
        openPayments.length,
        rows.filter((r) => r.paymentId).length,
      ),
      tone: "warn",
    },
  ];

  const actions = [
    ...pending.map((row) => ({
      key: row.decisionId,
      title: row.productName,
      sub: "MANUAL_REVIEW · awaiting a person",
      tone: "warn" as Tone,
      href: "/app/review",
    })),
    ...openPayments.map((row) => ({
      key: row.paymentId!,
      title: row.productName,
      sub: `${row.paymentStatus} · next: ${nextPaymentStep[row.paymentStatus!] ?? "check status"}`,
      tone: paymentTone[row.paymentStatus!],
      href: `/app/payments/${row.paymentId}`,
    })),
  ];

  return (
    <div className="app-page">
      {password === "updated" ? (
        <FlashToast message="Password updated. You're signed in." />
      ) : null}
      <div className="page-head">
        <h1>Overview</h1>
        <LiquidButton asChild size="lg" className="rounded-full">
          <Link href="/app/proposals/new">New proposal</Link>
        </LiquidButton>
      </div>

      {!constraints ? (
        <p className="notice" data-tone="warn">
          No constraints configured. This is not unrestricted permission: every
          proposal goes to manual review.{" "}
          <Link href="/app/constraints">Set constraints →</Link>
        </p>
      ) : null}

      <div className="kpi-grid">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="card kpi">
            <span className="eyebrow">{kpi.label}</span>
            <span className="kpi__value">{kpi.value}</span>
            <div className="meter" data-tone={kpi.tone}>
              <div style={{ width: `${kpi.percent}%` }} />
            </div>
            <span className="kpi__sub">{kpi.sub}</span>
          </article>
        ))}
      </div>

      <ForecastCard timeZone={constraints?.timezone ?? "UTC"} />

      <div className="split-grid">
        <section className="card span-2 list-card" aria-labelledby="recent">
          <header className="card-head">
            <h2 id="recent">Recent decisions</h2>
            <Link href="/app/decisions" className="link-quiet">
              View all →
            </Link>
          </header>
          {rows.length ? (
            rows.slice(0, 6).map((row) => (
              <Link
                key={row.decisionId}
                href={`/app/decisions/${row.decisionId}`}
                className="row-link overview-row"
              >
                <span className="truncate">{row.productName}</span>
                <span className="mono ink2">
                  {formatMoney(row.amount, row.currency)}
                </span>
                <span
                  className="mono small"
                  data-tone={scoreTone[row.qualityScore]}
                >
                  {scoreLabel(row.qualityScore)}
                </span>
                <span className="chip" data-tone={outcomeTone[row.outcome]}>
                  {row.reviewStatus
                    ? `REVIEW · ${row.reviewStatus}`
                    : row.outcome}
                </span>
              </Link>
            ))
          ) : (
            <div className="card-empty">
              <p>No decisions yet. Evaluate a proposal to see the first one.</p>
              <Link href="/app/proposals/new" className="btn btn-ghost">
                Run a proposal
              </Link>
            </div>
          )}
        </section>

        <section className="card stack-card" aria-labelledby="actions">
          <h2 id="actions">Needs your action</h2>
          {actions.length ? (
            actions.map((action) => (
              <Link key={action.key} href={action.href} className="action-tile">
                <span>{action.title}</span>
                <span className="mono small" data-tone={action.tone}>
                  {action.sub}
                </span>
              </Link>
            ))
          ) : (
            <p className="muted">
              Nothing waiting. Payments and reviews are settled.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
