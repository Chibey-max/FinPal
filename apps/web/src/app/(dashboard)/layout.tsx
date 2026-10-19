import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { AppNav, DemoPath } from "@/components/app-nav";
import { AutoHideHeader } from "@/components/auto-hide-header";
import { LogoutIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { SectionTransition } from "@/components/navigation-feedback";
import { ThemeToggle } from "@/components/theme-toggle";
import { ToastProvider } from "@/components/toast";
import { isOpenPayment } from "@/features/app/present";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth";
import { getUserDashboard } from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";

import "./app.css";

export default async function AppLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await requireUser();
  const rows = await getUserDashboard().then((d) =>
    d.listDecisionRows(user.id, { limit: 200 }),
  );
  const badges = {
    review: rows.filter(
      (row) => row.outcome === "MANUAL_REVIEW" && row.reviewStatus === null,
    ).length,
    payments: rows.filter((row) => isOpenPayment(row.paymentStatus)).length,
  };
  const mock = isMockMode();

  return (
    <ToastProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-frame">
        <div className="app-main">
          <AutoHideHeader className="app-topbar">
            <div className="app-topbar__lead">
              <Link href="/" className="app-brand" aria-label="FinPal home">
                <Logo size={26} />
              </Link>
              <AppNav badges={badges} />
            </div>
            <div className="app-topbar__tools">
              <Suspense fallback={<div className="demo-menu" />}>
                <DemoPath />
              </Suspense>
              {mock ? (
                <span
                  className="data-chip"
                  title="In-memory data and simulated PayPal Sandbox, Channel3 and KERNEL. Decisions still come from @finpal/backend."
                >
                  <i aria-hidden />
                  <span className="data-chip__text">Mock</span>
                </span>
              ) : null}
              <ThemeToggle />
              {mock ? null : (
                <form action={signOut}>
                  <button
                    type="submit"
                    className="icon-button"
                    aria-label={`Sign out ${user.email ?? ""}`.trim()}
                    title={user.email ?? "Sign out"}
                  >
                    <LogoutIcon />
                  </button>
                </form>
              )}
            </div>
          </AutoHideHeader>
          <main id="main" className="app-content">
            <SectionTransition>{children}</SectionTransition>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
