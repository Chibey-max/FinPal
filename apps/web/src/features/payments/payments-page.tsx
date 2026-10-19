import { PaymentError } from "@finpal/backend";
import {
  paymentAttemptSchema,
  type AuditEvent,
  type PaymentStatus,
} from "@finpal/contracts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { LinkPending } from "@/components/navigation-feedback";
import { Pagination, paginate } from "@/components/pagination";
import { FlashToast } from "@/components/toast";
import {
  formatClock,
  formatMoney,
  formatWhen,
  paymentTone,
  shortId,
  type Tone,
} from "@/features/app/present";
import { requireUser } from "@/lib/auth";
import {
  getPaymentService,
  getUserAuditLog,
  getUserConstraints,
  getUserDashboard,
} from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";

import { PaymentActions } from "./payment-actions";

const stateEvents: Partial<Record<AuditEvent["type"], PaymentStatus>> = {
  PAYMENT_CREATED: "CREATED",
  PAYMENT_APPROVED: "APPROVED",
  PAYMENT_AUTHORIZED: "AUTHORIZED",
  PAYMENT_CAPTURED: "CAPTURED",
  PAYMENT_VOIDED: "VOIDED",
};

const PAGE_SIZE = 6;

export interface PaymentNotice {
  page?: string;
  payment?: string;
  status?: string;
  code?: string;
}

function flash(
  notice: PaymentNotice,
): { message: string; tone: "ok" | "bad" } | null {
  if (notice.payment === "cancelled") {
    return {
      message: "PayPal checkout was cancelled. Nothing was charged.",
      tone: "bad",
    };
  }
  if (notice.payment === "error") {
    return {
      message: `The payment could not be completed (${notice.code ?? "unknown error"}).`,
      tone: "bad",
    };
  }
  if (notice.payment === "returned") {
    return {
      message: `Back from PayPal. Payment ${notice.status ?? "updated"}.`,
      tone: "ok",
    };
  }
  return null;
}

async function loadPayment(userId: string, paymentId: string) {
  try {
    return paymentAttemptSchema.parse(
      await getPaymentService().getPayment(userId, paymentId),
    );
  } catch (error) {
    if (error instanceof PaymentError && error.code === "PAYMENT_NOT_FOUND")
      return null;
    throw error;
  }
}

/** /app/payments and /app/payments/[id]. */
export async function PaymentsPage({
  selectedId,
  notice,
}: {
  selectedId: string | null;
  notice: PaymentNotice;
}) {
  const user = await requireUser();
  if (selectedId !== null && !z.uuid().safeParse(selectedId).success)
    notFound();

  const [rows, constraints] = await Promise.all([
    getUserDashboard().then((d) => d.listDecisionRows(user.id, { limit: 200 })),
    getUserConstraints(user.id),
  ]);
  const timeZone = constraints?.timezone ?? "UTC";
  const payments = rows
    .filter((row) => row.paymentId)
    .sort((a, b) =>
      (b.paymentUpdatedAt ?? "").localeCompare(a.paymentUpdatedAt ?? ""),
    );
  const selectedIndex = selectedId
    ? payments.findIndex((r) => r.paymentId === selectedId)
    : -1;
  const { page, pageCount, start, end } = paginate(
    payments.length,
    notice.page ??
      (selectedIndex >= 0 ? Math.floor(selectedIndex / PAGE_SIZE) + 1 : 1),
    PAGE_SIZE,
  );
  const pagePayments = payments.slice(start, end);
  const activeId = selectedId ?? pagePayments[0]?.paymentId ?? null;
  const pageQuery = page > 1 ? `?page=${page}` : "";
  const payment = activeId ? await loadPayment(user.id, activeId) : null;
  if (selectedId && !payment) notFound();

  const history = payment
    ? await getUserAuditLog()
        .then((log) =>
          log.listActivity(user.id, { entityId: payment.id, limit: 100 }),
        )
        .then((page) => page.events.slice().reverse())
    : [];
  const productName =
    rows.find((row) => row.paymentId === payment?.id)?.productName ??
    rows.find((row) => row.decisionId === payment?.decisionId)?.productName ??
    "Purchase";
  const message = flash(notice);

  const rail: PaymentStatus[] = payment
    ? [
        "CREATED",
        "APPROVED",
        "AUTHORIZED",
        payment.status === "VOIDED" ? "VOIDED" : "CAPTURED",
      ]
    : [];
  const railIndex = payment ? rail.indexOf(payment.status) : -1;

  return (
    <div className="app-page">
      {message ? (
        <FlashToast message={message.message} tone={message.tone} />
      ) : null}
      <div className="payments-layout">
        <div className="stack-md">
          <h1 className="page-title">Payments</h1>
          {payments.length
            ? pagePayments.map((row) => (
                <Link
                  key={row.paymentId}
                  href={`/app/payments/${row.paymentId}${pageQuery}`}
                  scroll={false}
                  className="card payment-row"
                  aria-current={row.paymentId === activeId ? "true" : undefined}
                >
                  <span className="payment-row__line">
                    <span className="truncate">{row.productName}</span>
                    <span className="mono">
                      {formatMoney(row.amount, row.currency)}
                    </span>
                  </span>
                  <span className="payment-row__line mono small">
                    <span className="ink4">
                      {shortId("payment_attempt", row.paymentId!)}
                      <LinkPending />
                    </span>
                    <span data-tone={paymentTone[row.paymentStatus!]}>
                      {row.paymentStatus}
                    </span>
                  </span>
                </Link>
              ))
            : null}
          <Pagination
            page={page}
            pageCount={pageCount}
            total={payments.length}
            pageSize={PAGE_SIZE}
            label="payments"
            hrefFor={(p) => `/app/payments?page=${p}`}
          />
          {payments.length ? null : (
            <div className="empty-panel empty-panel--left">
              <p>
                No payment attempts yet. Create a PayPal order from an approved
                decision.
              </p>
              <Link href="/app/decisions" className="btn btn-outline btn-sm">
                View decisions
              </Link>
            </div>
          )}
        </div>

        {payment ? (
          <div className="span-2 stack-md fade-in" key={payment.id}>
            <section className="card payment-detail">
              <div className="detail-head">
                <div className="stack-sm">
                  <span className="mono small ink4">
                    {shortId("payment_attempt", payment.id)} · PayPal order{" "}
                    {payment.paypalOrderId}
                  </span>
                  <span className="payment-detail__amount">
                    {formatMoney(payment.amount, payment.currency)}
                  </span>
                  <span className="ink3">
                    {productName} ·{" "}
                    <Link
                      href={`/app/decisions/${payment.decisionId}`}
                      className="link-quiet"
                    >
                      {shortId("decision", payment.decisionId)}
                    </Link>
                  </span>
                </div>
                <span
                  className="chip chip-md"
                  data-tone={paymentTone[payment.status]}
                  data-fill="soft"
                >
                  {payment.status}
                </span>
              </div>

              <ol className="state-rail" aria-label="Payment state">
                {rail.map((state, index) => {
                  const tone: Tone = paymentTone[state];
                  const step =
                    index < railIndex
                      ? "done"
                      : index === railIndex
                        ? "current"
                        : "todo";
                  return (
                    <li
                      key={state}
                      data-step={step}
                      data-tone={tone}
                      aria-current={step === "current" ? "step" : undefined}
                    >
                      <span>{state}</span>
                    </li>
                  );
                })}
              </ol>

              <PaymentActions
                key={`${payment.id}:${payment.status}`}
                payment={payment}
                productName={productName}
                sandboxCheckout={isMockMode()}
              />
            </section>

            <section className="card stack-card" aria-labelledby="history">
              <h2 id="history">State history</h2>
              {history.length ? (
                <ol className="history-list">
                  {history.map((event) => {
                    const state = stateEvents[event.type];
                    const issue =
                      typeof event.payload.issue === "string"
                        ? ` · ${event.payload.issue}`
                        : "";
                    return (
                      <li key={event.id}>
                        <span className="ink4">
                          {formatWhen(event.createdAt, timeZone)}
                        </span>
                        <span data-tone={state ? paymentTone[state] : "bad"}>
                          {state ?? `${event.type}${issue}`}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <span className="muted small">
                  No events yet. Updated{" "}
                  {formatClock(payment.updatedAt, timeZone)}.
                </span>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
