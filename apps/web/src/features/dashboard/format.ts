import type {
  DecisionOutcome,
  PaymentStatus,
  QualityScore,
} from "@finpal/contracts";

export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

export const toneClasses: Record<Tone, string> = {
  success:
    "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  danger: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
  info: "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  neutral: "bg-muted text-muted-foreground",
};

export const outcomeTone: Record<DecisionOutcome, Tone> = {
  AUTO_APPROVE: "success",
  MANUAL_REVIEW: "warning",
  BLOCK: "danger",
};

export const qualityTone: Record<QualityScore, Tone> = {
  GOOD: "success",
  FAIR: "warning",
  POOR: "danger",
  INSUFFICIENT_DATA: "neutral",
};

export const paymentTone: Record<PaymentStatus, Tone> = {
  CREATED: "neutral",
  APPROVED: "info",
  AUTHORIZED: "info",
  CAPTURED: "success",
  VOIDED: "warning",
  REFUNDED: "warning",
};

export function formatMoney(
  amount: number | null | undefined,
  currency: string,
): string {
  if (amount === null || amount === undefined) return "–";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Short local timestamp, e.g. "23 Oct, 11:00"; "–" when missing. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "–" : dateTime.format(date);
}
