import type {
  AuditEntityType,
  DecisionOutcome,
  PaymentStatus,
  QualityScore,
  TrustSignal,
} from "@finpal/contracts";

import { localDate } from "@/lib/zoned";

/**
 * Status tones from the design: text in the tone colour, a 12% fill and a
 * 35% border. `tone-*` classes in globals.css map them to tokens.
 */
export type Tone = "ok" | "warn" | "bad" | "info" | "muted" | "plain";

export const outcomeTone: Record<DecisionOutcome, Tone> = {
  AUTO_APPROVE: "ok",
  MANUAL_REVIEW: "warn",
  BLOCK: "bad",
};

export const scoreTone: Record<QualityScore, Tone> = {
  GOOD: "ok",
  FAIR: "warn",
  POOR: "bad",
  INSUFFICIENT_DATA: "muted",
};

export const paymentTone: Record<PaymentStatus, Tone> = {
  CREATED: "plain",
  APPROVED: "info",
  AUTHORIZED: "warn",
  CAPTURED: "ok",
  VOIDED: "bad",
  REFUNDED: "muted",
};

export const trustTone: Record<TrustSignal, Tone> = {
  PASS: "ok",
  FAIL: "bad",
  UNAVAILABLE: "warn",
  NOT_CHECKED: "muted",
};

export const scoreLabel = (score: QualityScore) =>
  score === "INSUFFICIENT_DATA" ? "INSUFFICIENT" : score;

const entityPrefix: Record<AuditEntityType, string> = {
  constraints: "cst",
  proposal: "prp",
  evaluation: "evl",
  decision: "dec",
  payment_attempt: "pay",
};

/** Short display id, e.g. dec_1a07, from a uuid. Full ids stay in URLs. */
export function shortId(kind: AuditEntityType, id: string) {
  return `${entityPrefix[kind]}_${id.replace(/-/g, "").slice(0, 4)}`;
}

/** Payment states that still need a PayPal step. */
export const isOpenPayment = (status: PaymentStatus | null) =>
  status !== null && !["CAPTURED", "VOIDED", "REFUNDED"].includes(status);

export const nextPaymentStep: Partial<Record<PaymentStatus, string>> = {
  CREATED: "approve in PayPal",
  APPROVED: "authorize",
  AUTHORIZED: "capture or void",
};

export function formatMoney(
  amount: number | null | undefined,
  currency: string,
): string {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function valid(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "09:12:14" in the zone; "—" when missing. */
export function formatClock(iso: string | null | undefined, timeZone: string) {
  const date = valid(iso);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Clock time for today, otherwise "Oct 14 · 09:12". */
export function formatWhen(
  iso: string | null | undefined,
  timeZone: string,
  now = new Date(),
) {
  const date = valid(iso);
  if (!date) return "—";
  if (localDate(date, timeZone) === localDate(now, timeZone)) {
    return formatClock(iso, timeZone);
  }
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} · ${time}`;
}

/** "Mon Oct 19 · 10:00" in the zone. */
export function formatEventDate(iso: string, timeZone: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  })
    .format(date)
    .replace(",", "");
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} · ${time}`;
}

/** Percent of a cap used, clamped to 0-100. */
export const percentOf = (value: number, cap: number | undefined) =>
  cap ? Math.min(100, Math.max(0, Math.round((value / cap) * 100))) : 0;
