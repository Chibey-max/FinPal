import type { AuditEvent, AuditEventType } from "@finpal/contracts";

export type EventTone = "success" | "warning" | "danger" | "neutral";

export interface EventDescription {
  title: string;
  detail?: string;
  tone: EventTone;
}

const titles: Record<AuditEventType, { title: string; tone: EventTone }> = {
  CONSTRAINTS_UPDATED: { title: "Spending limits updated", tone: "neutral" },
  PROPOSAL_CREATED: { title: "Proposal created", tone: "neutral" },
  EVALUATION_COMPLETED: { title: "Purchase evaluated", tone: "neutral" },
  DECISION_RECORDED: { title: "Decision recorded", tone: "neutral" },
  DECISION_APPROVED: { title: "Approved by reviewer", tone: "success" },
  DECISION_REJECTED: { title: "Rejected by reviewer", tone: "danger" },
  PAYMENT_CREATED: { title: "PayPal order created", tone: "neutral" },
  PAYMENT_APPROVED: { title: "Buyer approved in PayPal", tone: "neutral" },
  PAYMENT_AUTHORIZED: { title: "Payment authorized", tone: "success" },
  PAYMENT_CAPTURED: { title: "Payment captured", tone: "success" },
  PAYMENT_VOIDED: { title: "Authorization voided", tone: "warning" },
  PAYPAL_CALL_FAILED: { title: "PayPal request failed", tone: "danger" },
};

const decisionTones: Record<string, EventTone> = {
  AUTO_APPROVE: "success",
  MANUAL_REVIEW: "warning",
  BLOCK: "danger",
};

const text = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

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

/** Human-readable summary of an audit event for activity lists. */
export function describeEvent(event: AuditEvent): EventDescription {
  const base = titles[event.type];
  const p = event.payload;

  switch (event.type) {
    case "PROPOSAL_CREATED":
      return { ...base, detail: join(text(p.productName), money(p)) };
    case "EVALUATION_COMPLETED":
      return {
        ...base,
        detail: join(text(p.qualityScore), text(p.explanation)),
      };
    case "DECISION_RECORDED": {
      const outcome = text(p.outcome);
      return {
        title: outcome ? `Decision: ${outcome}` : base.title,
        tone: (outcome && decisionTones[outcome]) || base.tone,
        detail: text(p.reason),
      };
    }
    case "PAYMENT_CREATED":
    case "PAYMENT_AUTHORIZED":
    case "PAYMENT_CAPTURED":
      return {
        ...base,
        detail: join(
          money(p),
          text(p.paypalCaptureId) ??
            text(p.paypalAuthorizationId) ??
            text(p.paypalOrderId),
        ),
      };
    case "PAYMENT_APPROVED":
      return { ...base, detail: text(p.paypalOrderId) };
    case "PAYMENT_VOIDED":
      return { ...base, detail: text(p.paypalAuthorizationId) };
    case "PAYPAL_CALL_FAILED":
      return {
        title: text(p.operation) ? `PayPal ${p.operation} failed` : base.title,
        tone: base.tone,
        detail: join(
          text(p.issue),
          text(p.debugId) ? `debug id ${p.debugId}` : undefined,
        ),
      };
    default:
      return base;
  }
}

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * One-line detail for the activity table, e.g. "Order 5O19… · $119.99" or
 * "GOOD · median 339.99". Built only from the stored payload.
 */
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

export type EventTypeTone = "ok" | "bad" | "info" | "plain";

/** Colour for an event type in the activity table. */
export function eventTypeTone(event: AuditEvent): EventTypeTone {
  const { type } = event;
  if (/REJECTED|VOIDED|FAILED/.test(type)) return "bad";
  if (type === "DECISION_RECORDED" && event.payload.outcome === "BLOCK")
    return "bad";
  if (/CAPTURED|APPROVED$/.test(type)) return "ok";
  if (/PAYMENT|PAYPAL/.test(type)) return "info";
  return "plain";
}
