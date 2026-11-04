import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { DemoPath } from "@/components/app-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { Logo } from "@/components/logo";
import { SectionTransition } from "@/components/navigation-feedback";
import { ThemeToggle } from "@/components/theme-toggle";
import { ToastProvider } from "@/components/toast";
import { formatMoney, isOpenPayment } from "@/features/app/present";
import { needsYou } from "@/features/purchases/needs-you";
import { requireUser } from "@/lib/auth";
import {
  getDecisionRows,
  getSpendSummary,
  getUserConstraints,
} from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";

import "./app.css";

export default async function AppLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await requireUser();
  const [rows, constraints] = await Promise.all([
    getDecisionRows(user.id),
    getUserConstraints(user.id),
  ]);
  const spend = await getSpendSummary(user.id, constraints);
  const approvals = rows.filter(
    (row) => needsYou(row) || isOpenPayment(row.paymentStatus),
  ).length;
  const daily = constraints?.amountCaps.daily;
  const left = daily ? Math.max(0, daily - spend.spentToday) : null;
  const mock = isMockMode();

  return (
    <ToastProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-frame">
        <AppSidebar
          brand={
            <Link
              href="/app"
              className="side-brand"
              aria-label="FinPal overview"
            >
              <Logo size={26} />
            </Link>
          }
          approvals={approvals}
          budget={{
            left: left === null ? null : formatMoney(left, spend.currency),
            cap: daily ? formatMoney(daily, spend.currency) : null,
            percentLeft:
              left === null || !daily ? 0 : Math.round((left / daily) * 100),
          }}
          email={user.email}
          canSignOut={!mock}
          initialCollapsed={
            (await cookies()).get("finpal-sidebar")?.value === "collapsed"
          }
          purchases={rows.slice(0, 50).map((row) => ({
            id: row.decisionId,
            name: row.productName,
          }))}
        />
        <div className="app-main">
          <div className="app-tools">
            {mock ? (
              <>
                <Suspense fallback={<div className="demo-menu" />}>
                  <DemoPath />
                </Suspense>
                <span
                  className="data-chip"
                  title="In-memory data and simulated PayPal Sandbox, Channel3 and KERNEL. Decisions still come from @finpal/backend."
                >
                  <i aria-hidden />
                  <span className="data-chip__text">Mock</span>
                </span>
              </>
            ) : null}
            <ThemeToggle />
          </div>
          <main id="main" className="app-content">
            <SectionTransition>{children}</SectionTransition>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
