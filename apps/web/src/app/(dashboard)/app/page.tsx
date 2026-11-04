import type { DecisionRow } from "@finpal/contracts";
import Link from "next/link";

import { FlashToast } from "@/components/toast";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { ForecastCard } from "@/features/agent/forecast-card";
import {
  formatMoney,
  formatWhen,
  isOpenPayment,
  outcomeLabel,
  outcomeTone,
  paymentLabel,
  paymentTone,
  percentOf,
} from "@/features/app/present";
import { needsYou } from "@/features/purchases/needs-you";
import { requireUser } from "@/lib/auth";
import {
  getDecisionRows,
  getSpendSummary,
  getUserConstraints,
} from "@/lib/backend";

const status = (row: DecisionRow) =>
  row.paymentStatus
    ? {
        label: paymentLabel[row.paymentStatus],
        tone: paymentTone[row.paymentStatus],
      }
    : row.reviewStatus === "REJECTED"
      ? { label: "Rejected", tone: "bad" as const }
      : { label: outcomeLabel[row.outcome], tone: outcomeTone[row.outcome] };

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
  const caps = constraints?.amountCaps;
  const { currency } = spend;
  const timeZone = constraints?.timezone ?? "UTC";
  const waiting = rows.filter(needsYou);
  const unfinished = rows.filter((row) => isOpenPayment(row.paymentStatus));
  const paid = rows.filter((row) => row.paymentStatus === "CAPTURED");
  const leftToday = caps?.daily
    ? Math.max(0, caps.daily - spend.spentToday)
    : null;

  const kpis = [
    {
      label: "Left to spend today",
      value: leftToday === null ? "No limit" : formatMoney(leftToday, currency),
      sub: caps?.daily
        ? `${formatMoney(spend.spentToday, currency)} spent of ${formatMoney(caps.daily, currency)}`
        : "Set a daily budget in Rules",
      // Fills with what's left, like the meter in the sidebar.
      percent: caps?.daily
        ? 100 - percentOf(spend.spentToday, caps.daily)
        : null,
    },
    {
      label: "Spent this month",
      value: formatMoney(spend.spentThisMonth, currency),
      sub: caps?.monthly
        ? `of ${formatMoney(caps.monthly, currency)} budget`
        : "No monthly budget",
      percent: percentOf(spend.spentThisMonth, caps?.monthly),
    },
    {
      label: "Waiting on you",
      value: String(waiting.length + unfinished.length),
      sub: unfinished.length
        ? `${unfinished.length} unfinished ${unfinished.length === 1 ? "payment" : "payments"}`
        : "Reviews and approvals",
      percent: null,
    },
    {
      label: "Bought",
      value: String(paid.length),
      sub: `${rows.length} ${rows.length === 1 ? "item" : "items"} checked in total`,
      percent: null,
    },
  ];

  const attention = [...waiting, ...unfinished].slice(0, 4);

  return (
    <div className="app-page">
      {password === "updated" ? (
        <FlashToast message="Password updated. You're signed in." />
      ) : null}
      <div className="page-head">
        <div className="page-head__text">
          <h1>Overview</h1>
          <p>Your spending, and what needs you today.</p>
        </div>
        <LiquidButton asChild size="lg" className="rounded-full">
          <Link href="/app/agent">Shop with the agent</Link>
        </LiquidButton>
      </div>

      {!constraints ? (
        <p className="notice" data-tone="warn">
          You haven&apos;t set any rules yet, so you&apos;ll review everything
          the agent finds. <Link href="/app/rules">Set your rules →</Link>
        </p>
      ) : null}

      <div className="kpi-grid">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="card kpi">
            <span className="kpi__label">{kpi.label}</span>
            <span className="kpi__value">{kpi.value}</span>
            {kpi.percent !== null ? (
              <div className="meter" data-tone="ok">
                <div style={{ width: `${kpi.percent}%` }} />
              </div>
            ) : null}
            <span className="kpi__sub">{kpi.sub}</span>
          </article>
        ))}
      </div>

      <div className="dash-grid">
        <section className="card list-card" aria-labelledby="recent">
          <header className="card-head">
            <h2 id="recent">Recent purchases</h2>
            <Link href="/app/purchases" className="link-quiet">
              View all
            </Link>
          </header>
          {rows.length ? (
            rows.slice(0, 7).map((row) => {
              const { label, tone } = status(row);
              return (
                <Link
                  key={row.decisionId}
                  href={`/app/purchases/${row.decisionId}`}
                  className="row-link dash-row"
                >
                  <span className="stack-xs dash-row__name">
                    <span className="truncate">{row.productName}</span>
                    <span className="small ink4">
                      {formatWhen(row.decidedAt, timeZone)}
                    </span>
                  </span>
                  <span className="chip" data-tone={tone}>
                    {label}
                  </span>
                  <span className="mono dash-row__amount">
                    {formatMoney(row.amount, row.currency)}
                  </span>
                </Link>
              );
            })
          ) : (
            <div className="card-empty">
              <p>Nothing yet. Give the agent your first shopping list.</p>
              <Link href="/app/agent" className="btn btn-outline">
                Open the agent
              </Link>
            </div>
          )}
        </section>

        <div className="stack-lg">
          <section className="card stack-card" aria-labelledby="attention">
            <header className="card-head card-head--flush">
              <h2 id="attention">Needs you</h2>
              {attention.length ? (
                <Link href="/app/approvals" className="link-quiet">
                  View all
                </Link>
              ) : null}
            </header>
            {attention.length ? (
              attention.map((row) => (
                <Link
                  key={row.decisionId}
                  href={`/app/purchases/${row.decisionId}`}
                  className="action-tile"
                >
                  <span className="truncate">{row.productName}</span>
                  <span className="mono small" data-tone="warn">
                    {isOpenPayment(row.paymentStatus)
                      ? "Finish payment"
                      : row.outcome === "MANUAL_REVIEW" && !row.reviewStatus
                        ? "Review"
                        : "Ready to pay"}{" "}
                    · {formatMoney(row.amount, row.currency)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="muted small">You&apos;re all caught up.</p>
            )}
          </section>
          <ForecastCard timeZone={timeZone} />
        </div>
      </div>
    </div>
  );
}
