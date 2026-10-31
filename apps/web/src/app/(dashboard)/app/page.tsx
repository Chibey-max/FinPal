import Link from "next/link";

import { FlashToast } from "@/components/toast";
import { AgentConsole } from "@/features/agent/agent-console";
import { formatMoney, isOpenPayment, percentOf } from "@/features/app/present";
import { needsYou } from "@/features/purchases/needs-you";
import { requireUser } from "@/lib/auth";
import {
  getDecisionRows,
  getSpendSummary,
  getUserConstraints,
} from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";

export default async function AgentHomePage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string; need?: string }>;
}) {
  const user = await requireUser();
  const { password, need } = await searchParams;
  const constraints = await getUserConstraints(user.id);
  const [rows, spend] = await Promise.all([
    getDecisionRows(user.id),
    getSpendSummary(user.id, constraints),
  ]);
  const caps = constraints?.amountCaps;
  const { currency } = spend;
  const waiting =
    rows.filter(needsYou).length +
    rows.filter((row) => isOpenPayment(row.paymentStatus)).length;

  const meters = [
    {
      label: "Today",
      spent: spend.spentToday,
      cap: caps?.daily,
    },
    {
      label: "This month",
      spent: spend.spentThisMonth,
      cap: caps?.monthly,
    },
  ];

  return (
    <div className="app-page">
      {password === "updated" ? (
        <FlashToast message="Password updated. You're signed in." />
      ) : null}
      <div className="page-head__text">
        <h1>What do you need?</h1>
        <p>
          Drop your shopping list. The agent finds the best options, your rules
          check them, and you approve once.
        </p>
      </div>

      {!constraints ? (
        <p className="notice" data-tone="warn">
          You haven&apos;t set any rules yet, so you&apos;ll review everything
          the agent finds. <Link href="/app/rules">Set your rules →</Link>
        </p>
      ) : null}

      <AgentConsole
        timeZone={constraints?.timezone ?? "UTC"}
        sandbox={isMockMode()}
        initialList={need?.slice(0, 1000) ?? ""}
        side={
          <section className="card stack-card" aria-label="Your spending">
            {meters.map((meter) => (
              <div key={meter.label} className="spend-meter">
                <span className="eyebrow">{meter.label}</span>
                <span className="mono">
                  {formatMoney(meter.spent, currency)}
                  {meter.cap ? (
                    <span className="ink4">
                      {" "}
                      of {formatMoney(meter.cap, currency)}
                    </span>
                  ) : null}
                </span>
                <div className="meter" data-tone="ok">
                  <div
                    style={{ width: `${percentOf(meter.spent, meter.cap)}%` }}
                  />
                </div>
              </div>
            ))}
            {waiting ? (
              <Link href="/app/purchases?view=needs" className="action-tile">
                <span>
                  {waiting}{" "}
                  {waiting === 1 ? "purchase needs" : "purchases need"} you
                </span>
                <span className="mono small" data-tone="warn">
                  Review →
                </span>
              </Link>
            ) : null}
          </section>
        }
      />
    </div>
  );
}
