import type { DecisionRow } from "@finpal/contracts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FlashToast } from "@/components/toast";
import { ActivityGrid } from "@/features/activity/activity-grid";
import { DecisionsGrid } from "@/features/decisions/decisions-grid";
import { DecisionDetailView } from "@/features/decisions/decisions-screen";
import { isOpenPayment } from "@/features/app/present";
import { needsYou } from "@/features/purchases/needs-you";
import { requireUser } from "@/lib/auth";
import {
  getAssistantService,
  getDecisionRows,
  getUserAuditLog,
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
  { key: "needs", label: "Needs you" },
  { key: "active", label: "In progress" },
  { key: "done", label: "Done" },
  { key: "log", label: "Full log" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

const inView = (row: DecisionRow, view: ViewKey) => {
  if (view === "needs") return needsYou(row);
  if (view === "active") return isOpenPayment(row.paymentStatus);
  if (view === "done")
    return !needsYou(row) && !isOpenPayment(row.paymentStatus);
  return true;
};

const EMPTY: Record<ViewKey, string> = {
  all: "Nothing yet. Give the agent a shopping list to get started.",
  needs: "Nothing is waiting for you.",
  active: "No payments in progress.",
  done: "Nothing finished yet.",
  log: "",
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

/** /app/purchases and /app/purchases/[id]: one place for everything bought. */
export async function PurchasesPage({
  selectedId,
  params,
}: {
  selectedId: string | null;
  params: PurchasesParams;
}) {
  const user = await requireUser();
  if (selectedId !== null && !z.uuid().safeParse(selectedId).success) {
    notFound();
  }
  const view: ViewKey = VIEWS.find((v) => v.key === params.view)?.key ?? "all";

  const [rows, constraints, details] = await Promise.all([
    getDecisionRows(user.id),
    getUserConstraints(user.id),
    getUserDecisionDetail(),
  ]);
  const detail = selectedId
    ? await details.getDecisionDetail(user.id, selectedId)
    : null;
  if (selectedId && !detail) notFound();
  const timeZone = constraints?.timezone ?? "UTC";
  const visible = rows.filter((row) => inView(row, view));
  const log =
    view === "log"
      ? await getUserAuditLog().then((audit) =>
          audit.listActivity(user.id, { limit: 100 }),
        )
      : null;
  const message = flash(params);
  const needsCount = rows.filter(needsYou).length;

  return (
    <div className="app-page">
      {message ? (
        <FlashToast message={message.message} tone={message.tone} />
      ) : null}
      <div className="page-head">
        <div className="page-head__text">
          <h1>Purchases</h1>
          <p>
            Everything the agent found and bought, why, and what&apos;s waiting
            for you.
          </p>
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
              {option.key === "needs" && needsCount ? (
                <span className="nav-badge">{needsCount}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      </div>

      {log ? (
        <ActivityGrid initial={log} timeZone={timeZone} />
      ) : visible.length ? (
        <DecisionsGrid
          key={view}
          rows={visible}
          selectedId={selectedId}
          timeZone={timeZone}
        />
      ) : (
        <div className="empty-panel">
          <p>{EMPTY[view]}</p>
          {view === "all" ? (
            <Link href="/app" className="btn btn-outline">
              Give the agent a list
            </Link>
          ) : null}
        </div>
      )}

      {detail ? (
        <DecisionDetailView
          detail={detail}
          timeZone={timeZone}
          summary={getAssistantService().configured}
        />
      ) : null}
    </div>
  );
}
