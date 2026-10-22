import type { AuditEvent } from "@finpal/contracts";

import type { Tone } from "@/theme";

// Ported from apps/web/src/features/activity/describe-event.ts: one-line
// summaries of audit events, built only from the stored payload.

const text = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

function money(payload: Record<string, unknown>) {
  const { amount, currency } = payload;
  if (typeof amount !== "number" || typeof currency !== "string") return;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

const join = (...parts: (string | undefined)[]) =>
  parts.filter(Boolean).join(" · ") || undefined;

/** One-line detail for an activity row, e.g. "Order 5O19… · $119.99". */
export function summarizeEvent(event: AuditEvent): string {
  const p = event.payload;
  switch (event.type) {
    case "CONSTRAINTS_UPDATED": {
      if (p.cleared) return "Constraints cleared";
      const caps = [p.perPurchase, p.daily, p.monthly]
        .map((cap) => num(cap) ?? "—")
        .join("/");
      return join(
        text(p.window) && `${p.window} ${text(p.timezone) ?? ""}`.trim(),
        `caps ${caps} ${text(p.currency) ?? ""}`.trim(),
      )!;
    }
    case "PROPOSAL_CREATED":
      return (
        join(
          text(p.productName),
          money(p),
          p.source === "CALENDAR" ? "from calendar" : undefined,
        ) ?? "Proposal created"
      );
    case "EVALUATION_COMPLETED": {
      const median = num(p.medianPrice);
      return median !== undefined
        ? join(text(p.qualityScore), `median ${median.toFixed(2)}`)!
        : join(
            text(p.qualityScore),
            `${num(p.offerCount) ?? 0} usable offers`,
          )!;
    }
    case "DECISION_RECORDED": {
      const codes = Array.isArray(p.reasonCodes)
        ? p.reasonCodes.filter(
            (code): code is string => typeof code === "string",
          )
        : [];
      return (
        join(text(p.outcome), codes.join(", ") || undefined) ??
        "Decision recorded"
      );
    }
    case "DECISION_APPROVED":
      return `Approved by ${text(p.reviewer) ?? "reviewer"}`;
    case "DECISION_REJECTED":
      return `Rejected by ${text(p.reviewer) ?? "reviewer"}`;
    case "PAYMENT_CREATED":
      return (
        join(text(p.paypalOrderId) && `Order ${p.paypalOrderId}`, money(p)) ??
        "PayPal order created"
      );
    case "PAYMENT_APPROVED":
      return join("Buyer approved in PayPal", text(p.paypalOrderStatus))!;
    case "PAYMENT_AUTHORIZED":
      return join("Authorization held", money(p))!;
    case "PAYMENT_CAPTURED":
      return money(p) ? `Captured ${money(p)}` : "Captured";
    case "PAYMENT_VOIDED":
      return "Authorization voided before capture";
    case "PAYPAL_CALL_FAILED":
      return (
        join(
          text(p.operation) && `${p.operation} failed`,
          text(p.issue),
          text(p.debugId) && `debug ${p.debugId}`,
        ) ?? "PayPal request failed"
      );
  }
}

/** Colour for an event type in the activity list. */
export function eventTone(event: AuditEvent): Tone {
  const { type } = event;
  if (/REJECTED|VOIDED|FAILED/.test(type)) return "bad";
  if (type === "DECISION_RECORDED" && event.payload.outcome === "BLOCK")
    return "bad";
  if (/CAPTURED|APPROVED$/.test(type)) return "ok";
  if (/PAYMENT|PAYPAL/.test(type)) return "info";
  return "plain";
}

const entityPrefix: Record<AuditEvent["entityType"], string> = {
  constraints: "cst",
  proposal: "prp",
  evaluation: "evl",
  decision: "dec",
  payment_attempt: "pay",
};

/** Short display id of what the event is about, e.g. dec_1a07. */
export const entityShort = (event: AuditEvent) =>
  `${entityPrefix[event.entityType]}_${event.entityId.replace(/-/g, "").slice(0, 4)}`;
