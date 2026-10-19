import type {
  ConstraintCheck,
  Decision,
  Evaluation,
  QualityScoreResult,
  TrustSignal,
} from "@finpal/contracts";

import type { Tone } from "@/features/app/present";

// Presentation of an evaluation the backend already made. Nothing here
// decides an outcome: it only lays out the stored constraint check, Quality
// Score and reasons for the decision detail screen.

export interface CheckRow {
  label: string;
  detail: string;
  mark: "PASS" | "FAIL" | "OVER" | "NONE" | "SKIP";
  tone: Tone;
}

const passed = (label: string, detail: string): CheckRow => ({
  label,
  detail,
  mark: "PASS",
  tone: "ok",
});

/** The constraints-and-caps checklist from the stored constraint check. */
export function constraintChecklist(check: ConstraintCheck | null): CheckRow[] {
  if (!check) {
    return [
      {
        label: "Constraints configured",
        detail: "None configured. Automatic approval is disabled.",
        mark: "NONE",
        tone: "warn",
      },
    ];
  }
  const reason = (code: ConstraintCheck["reasons"][number]["code"]) =>
    check.reasons.find((r) => r.code === code);

  const currency = reason("CURRENCY_MISMATCH");
  if (currency) {
    // Caps cannot be compared across currencies; the backend fails closed.
    const skipped = (label: string): CheckRow => ({
      label,
      detail: "Not compared. FinPal never converts currencies.",
      mark: "SKIP",
      tone: "muted",
    });
    return [
      {
        label: "Currency",
        detail: `${currency.message} No conversion is performed.`,
        mark: "FAIL",
        tone: "bad",
      },
      skipped("Time window"),
      skipped("Per-transaction cap"),
      skipped("Daily cap"),
      skipped("Monthly cap"),
    ];
  }

  const window = reason("OUTSIDE_TIME_WINDOW");
  const caps = [
    [
      "Per-transaction cap",
      "OVER_PER_PURCHASE_CAP",
      "Within the per-purchase cap.",
    ],
    [
      "Daily cap",
      "OVER_DAILY_CAP",
      "Within today's cap, counting committed spend.",
    ],
    [
      "Monthly cap",
      "OVER_MONTHLY_CAP",
      "Within this month's cap, counting committed spend.",
    ],
  ] as const;

  return [
    window
      ? {
          label: "Time window",
          detail: window.message,
          mark: "FAIL",
          tone: "bad",
        }
      : passed("Time window", "Inside your allowed spending times."),
    passed("Currency", "Matches your constraints currency."),
    ...caps.map(([label, code, ok]): CheckRow => {
      const over = reason(code);
      return over
        ? { label, detail: over.message, mark: "OVER", tone: "bad" }
        : passed(label, ok);
    }),
  ];
}

/** Reason codes from the decision and the constraint check, deduplicated. */
export function reasonCodes(decision: Decision, evaluation: Evaluation) {
  const codes = [
    ...(evaluation.constraintCheck?.reasons.map((r) => r.code) ?? []),
    ...decision.reasons.map((r) => r.code),
  ];
  return [...new Set(codes)];
}

export const trustDetail: Record<TrustSignal, string> = {
  PASS: "KERNEL reports the merchant as trusted.",
  FAIL: "KERNEL flagged the merchant.",
  UNAVAILABLE: "KERNEL was unavailable, so no positive result is assumed.",
  NOT_CHECKED:
    "Merchant trust checking is not configured, so no positive result is assumed.",
};

export interface PriceBand {
  /** Percent positions along the band, 0-100. */
  goodWidth: number;
  fairWidth: number;
  poorLeft: number;
  median: number;
  proposed: number;
  dots: number[];
}

/** Band chart geometry: GOOD/FAIR/POOR zones, median, proposal and offers. */
export function priceBand(quality: QualityScoreResult): PriceBand | null {
  const median = quality.medianPrice;
  if (median === null) return null;
  const prices = [
    ...quality.references.map((o) => o.price),
    quality.proposedPrice,
  ];
  const low = Math.min(...prices, median) * 0.9;
  const high =
    Math.max(...prices, median * (quality.thresholds.fairMaxRatio + 0.1)) *
    1.04;
  const position = (value: number) =>
    Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100));
  const good = position(median * quality.thresholds.goodMaxRatio);
  const fair = position(median * quality.thresholds.fairMaxRatio);
  return {
    goodWidth: good,
    fairWidth: fair - good,
    poorLeft: fair,
    median: position(median),
    proposed: position(quality.proposedPrice),
    dots: quality.references.map((o) => position(o.price)),
  };
}

/** "104.0%" of the median, or "—" without one. */
export const ratioLabel = (quality: QualityScoreResult) =>
  quality.ratioToMedian === null
    ? "—"
    : `${(quality.ratioToMedian * 100).toFixed(1)}%`;

const str = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * One line about what the merchant trust check looked at, from the stored
 * evidence (KERNEL visits the cheapest Channel3 merchant URL), e.g.
 * "Checked bestbuy.com · HTTP 200". Null when there is nothing to show.
 */
export function describeTrustEvidence(
  evidence: Record<string, unknown>,
): string | null {
  const reason = str(evidence.reason);
  if (reason === "kernel_not_configured") return null;
  const target =
    str(evidence.merchant) ??
    (() => {
      const url = str(evidence.url);
      if (!url) return null;
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    })();
  const status =
    typeof evidence.httpStatus === "number"
      ? `HTTP ${evidence.httpStatus}`
      : typeof evidence.status === "number"
        ? `HTTP ${evidence.status}`
        : null;
  const parts = [
    target ? `Checked ${target}` : null,
    status,
    reason ? reason.replaceAll("_", " ") : null,
    evidence.simulated === true ? "simulated" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
