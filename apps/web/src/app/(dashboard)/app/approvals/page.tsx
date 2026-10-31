import Link from "next/link";

import {
  DEFAULT_PAGE_SIZE,
  Pagination,
  paginate,
} from "@/components/pagination";
import { formatMoney, formatWhen, isOpenPayment } from "@/features/app/present";
import { DecisionActions } from "@/features/decisions/decision-actions";
import { needsYou } from "@/features/purchases/needs-you";
import { requireUser } from "@/lib/auth";
import { getDecisionRows, getUserConstraints } from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [rows, constraints] = await Promise.all([
    getDecisionRows(user.id),
    getUserConstraints(user.id),
  ]);
  const timeZone = constraints?.timezone ?? "UTC";
  const items = rows.filter(
    (row) => needsYou(row) || isOpenPayment(row.paymentStatus),
  );
  const { page, pageCount, start, end } = paginate(
    items.length,
    params.page,
    DEFAULT_PAGE_SIZE,
  );

  return (
    <div className="app-page">
      <div className="page-head__text">
        <h1>Approvals</h1>
        <p>Purchases waiting for your decision or your PayPal approval.</p>
      </div>

      {items.length ? (
        <section className="card list-card" aria-label="Waiting on you">
          {items.slice(start, end).map((row) => (
            <article key={row.decisionId} className="approval-row">
              <div className="stack-xs approval-row__main">
                <Link
                  href={`/app/purchases/${row.decisionId}`}
                  className="approval-row__name truncate"
                >
                  {row.productName}
                </Link>
                <span className="small ink3 approval-row__why">
                  {row.reason}
                </span>
                <span className="small ink4">
                  {formatWhen(row.decidedAt, timeZone)}
                </span>
              </div>
              <span className="mono approval-row__amount">
                {formatMoney(row.amount, row.currency)}
              </span>
              <div className="approval-row__act">
                {isOpenPayment(row.paymentStatus) ? (
                  <Link
                    href={`/app/purchases/${row.decisionId}`}
                    className="btn btn-outline btn-sm"
                  >
                    Finish payment
                  </Link>
                ) : (
                  <DecisionActions
                    decisionId={row.decisionId}
                    state={
                      row.outcome === "MANUAL_REVIEW" && !row.reviewStatus
                        ? { kind: "review" }
                        : { kind: "pay" }
                    }
                    productName={row.productName}
                    sandbox={isMockMode()}
                    bare
                  />
                )}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="empty-panel">
          <p>You&apos;re all caught up. Nothing is waiting for you.</p>
          <Link href="/app/agent" className="btn btn-outline">
            Shop with the agent
          </Link>
        </div>
      )}
      <Pagination
        page={page}
        pageCount={pageCount}
        total={items.length}
        pageSize={DEFAULT_PAGE_SIZE}
        label="items"
        hrefFor={(p) => `/app/approvals?page=${p}`}
      />
    </div>
  );
}
