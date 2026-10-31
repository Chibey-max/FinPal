import type { DecisionRow } from "@finpal/contracts";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ChevronLeftIcon } from "@/components/icons";
import { FlashToast } from "@/components/toast";
import { DecisionsGrid } from "@/features/decisions/decisions-grid";
import { DecisionDetailView } from "@/features/decisions/decisions-screen";
import { isOpenPayment } from "@/features/app/present";
import { needsYou } from "@/features/purchases/needs-you";
import { requireUser } from "@/lib/auth";
import {
  getAssistantService,
  getDecisionRows,
  getUserConstraints,
  getUserDecisionDetail,
} from "@/lib/backend";

export interface PurchasesParams {
  view?: string;
  payment?: string;
  code?: string;
}

const VIEWS = [
  { key: "all", label: "All" },
  { key: "active", label: "In progress" },
  { key: "done", label: "Done" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

const inView = (row: DecisionRow, view: ViewKey) => {
  if (view === "active") return isOpenPayment(row.paymentStatus);
  if (view === "done")
    return !needsYou(row) && !isOpenPayment(row.paymentStatus);
  return true;
};

const EMPTY: Record<ViewKey, string> = {
  all: "Nothing yet. Give the agent a shopping list to get started.",
  active: "No payments in progress.",
  done: "Nothing finished yet.",
};

function flash(params: PurchasesParams) {
  if (params.payment === "cancelled") {
    return {
      message: "PayPal checkout was cancelled. Nothing was charged.",
      tone: "bad" as const,
    };
  }
  if (params.payment === "error") {
    const overCap = params.code === "BASKET_OVER_CAP";
    return {
      message: overCap
        ? "This no longer fits your budget, so nothing was charged."
        : "The payment couldn't be finished. Open the item to retry.",
      tone: "bad" as const,
    };
  }
  if (params.payment === "returned") {
    return { message: "Paid. Your purchases are below.", tone: "ok" as const };
  }
  return null;
}

/** /app/purchases: everything the agent found and bought. */
export async function PurchasesPage({ params }: { params: PurchasesParams }) {
  // Old links to views that became their own pages.
  if (params.view === "needs") redirect("/app/approvals");
  if (params.view === "log") redirect("/app/activity");

  const user = await requireUser();
  const view: ViewKey = VIEWS.find((v) => v.key === params.view)?.key ?? "all";
  const [rows, constraints] = await Promise.all([
    getDecisionRows(user.id),
    getUserConstraints(user.id),
  ]);
  const visible = rows.filter((row) => inView(row, view));
  const message = flash(params);

  return (
    <div className="app-page">
      {message ? (
        <FlashToast message={message.message} tone={message.tone} />
      ) : null}
      <div className="page-head">
        <div className="page-head__text">
          <h1>Purchases</h1>
          <p>Everything the agent found and bought. Open one to see why.</p>
        </div>
        <nav className="segmented" aria-label="Filter purchases">
          {VIEWS.map((option) => (
            <Link
              key={option.key}
              href={
                option.key === "all"
                  ? "/app/purchases"
                  : `/app/purchases?view=${option.key}`
              }
              aria-current={view === option.key ? "true" : undefined}
              scroll={false}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      {visible.length ? (
        <DecisionsGrid
          key={view}
          rows={visible}
          selectedId={null}
          timeZone={constraints?.timezone ?? "UTC"}
        />
      ) : (
        <div className="empty-panel">
          <p>{EMPTY[view]}</p>
          {view === "all" ? (
            <Link href="/app/agent" className="btn btn-outline">
              Give the agent a list
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** /app/purchases/[id]: one purchase, with the evidence behind its outcome. */
export async function PurchaseDetailPage({
  id,
  params,
}: {
  id: string;
  params: PurchasesParams;
}) {
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) notFound();
  const [constraints, details] = await Promise.all([
    getUserConstraints(user.id),
    getUserDecisionDetail(),
  ]);
  const detail = await details.getDecisionDetail(user.id, id);
  if (!detail) notFound();
  const message = flash(params);

  return (
    <div className="app-page">
      {message ? (
        <FlashToast message={message.message} tone={message.tone} />
      ) : null}
      <Link href="/app/purchases" className="back-link">
        <ChevronLeftIcon />
        Purchases
      </Link>
      <DecisionDetailView
        detail={detail}
        timeZone={constraints?.timezone ?? "UTC"}
        summary={getAssistantService().configured}
      />
    </div>
  );
}
