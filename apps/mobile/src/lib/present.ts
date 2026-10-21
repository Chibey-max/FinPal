import type {
  DecisionOutcome,
  PaymentStatus,
  QualityScore,
  TrustSignal,
} from "@finpal/contracts";

import type { Tone } from "@/theme";

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

/** Short display id, e.g. dec_1a07, from a uuid. */
export const shortId = (prefix: string, id: string) =>
  `${prefix}_${id.replace(/-/g, "").slice(0, 4)}`;

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

/** "Oct 20 · 11:40" in the given zone; "—" when missing or invalid. */
export function formatWhen(iso: string | null | undefined, timeZone: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  try {
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
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

/** Percent of a cap used, clamped to 0-100. */
export const percentOf = (value: number, cap: number | undefined) =>
  cap ? Math.min(100, Math.max(0, Math.round((value / cap) * 100))) : 0;
