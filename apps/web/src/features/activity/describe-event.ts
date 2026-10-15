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
