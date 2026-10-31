import {
  MIN_COMPARABLE_OFFERS,
  QUALITY_THRESHOLDS,
  UNUSUALLY_LOW_RATIO,
  type OfferLookup,
  type QualityScore,
  type QualityScoreResult,
} from "@finpal/contracts";

export interface ScoreQualityInput {
  proposedPrice: number;
  currency: string;
  lookup: OfferLookup;
}

const toCents = (amount: number) => Math.round(amount * 100);

/**
 * Median in half-cents (2 x cents), so an even count's midpoint such as
 * 100.005 is represented exactly as an integer.
 */
export function medianHalfCents(prices: readonly number[]): number {
  const cents = prices.map(toCents).sort((a, b) => a - b);
  const mid = Math.floor(cents.length / 2);
  return cents.length % 2 === 1
    ? cents[mid]! * 2
    : cents[mid - 1]! + cents[mid]!;
}

// Thresholds as integer percentages so comparisons stay in integer maths:
// proposed <= median x 1.05  <=>  proposedCents x 2 x 100 <= medianHalfCents x 105
const GOOD_MAX_PERCENT = Math.round(QUALITY_THRESHOLDS.goodMaxRatio * 100);
const FAIR_MAX_PERCENT = Math.round(QUALITY_THRESHOLDS.fairMaxRatio * 100);
const LOW_PERCENT = Math.round(UNUSUALLY_LOW_RATIO * 100);

function band(proposedCents: number, median2: number): QualityScore {
  const proposedScaled = proposedCents * 2 * 100;
  if (proposedScaled <= median2 * GOOD_MAX_PERCENT) return "GOOD";
  if (proposedScaled <= median2 * FAIR_MAX_PERCENT) return "FAIR";
  return "POOR";
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount,
  );
}

function describeDifference(ratio: number) {
  const percent = Math.abs(ratio - 1) * 100;
  if (percent < 0.05) return "equal to";
  return `${percent.toFixed(1)}% ${ratio > 1 ? "above" : "below"}`;
}

const insufficientReasons: Record<OfferLookup["status"], string> = {
  OK: "",
  INSUFFICIENT_OFFERS: `Fewer than ${MIN_COMPARABLE_OFFERS} comparable offers were found`,
  UNSUPPORTED_CURRENCY: "Comparable prices are not available in this currency",
  UNAVAILABLE: "The price comparison service was unavailable",
};

/**
 * Quality Score v1. Deterministic: the same inputs always give the same
 * category. An LLM may rephrase the explanation but must never choose or
 * change the category (PRD section 5).
 */
export function scoreQuality(input: ScoreQualityInput): QualityScoreResult {
  const { proposedPrice, lookup } = input;
  const currency = input.currency.toUpperCase();
  const offers = lookup.offers;
  const base = {
    proposedPrice,
    currency,
    offerCount: offers.length,
    thresholds: { ...QUALITY_THRESHOLDS },
    offerStatus: lookup.status,
    references: offers,
  };

  // Any doubt about the data means Insufficient data, which can never be
  // auto-approved: provider problems, too few offers, or offers that are not
  // in the proposal's currency (unusable currency data).
  const usable =
    lookup.status === "OK" &&
    offers.length >= MIN_COMPARABLE_OFFERS &&
    lookup.currency.toUpperCase() === currency &&
    offers.every((offer) => offer.currency.toUpperCase() === currency);

  if (!usable) {
    const reason =
      lookup.status !== "OK"
        ? insufficientReasons[lookup.status]
        : offers.length < MIN_COMPARABLE_OFFERS
          ? insufficientReasons.INSUFFICIENT_OFFERS
          : "Comparable prices were in a different currency";
    return {
      ...base,
      score: "INSUFFICIENT_DATA",
      medianPrice: null,
      lowestPrice:
        offers.length > 0 ? Math.min(...offers.map((o) => o.price)) : null,
      ratioToMedian: null,
      explanation: `${reason}, so the price cannot be scored. This purchase needs manual review.`,
    };
  }

  const median2 = medianHalfCents(offers.map((offer) => offer.price));
  const medianPrice = Math.round(median2 / 2) / 100;
  const lowestPrice = Math.min(...offers.map((offer) => offer.price));
  const proposedCents = toCents(proposedPrice);
  const ratio = (proposedCents * 2) / median2;
  const score = band(proposedCents, median2);
  const unusuallyLow = proposedCents * 2 * 100 < median2 * LOW_PERCENT;

  const comparison = `${formatMoney(proposedPrice, currency)} is ${describeDifference(ratio)} the median of ${formatMoney(medianPrice, currency)} across ${offers.length} offers (lowest ${formatMoney(lowestPrice, currency)}).`;
  const verdicts: Record<Exclude<QualityScore, "INSUFFICIENT_DATA">, string> = {
    GOOD: "Good: no more than 5% above the median.",
    FAIR: "Fair: 5-20% above the median, so it needs review.",
    POOR: "Poor: more than 20% above the median.",
  };

  return {
    ...base,
    score,
    medianPrice,
    lowestPrice,
    ratioToMedian: Math.round(ratio * 10_000) / 10_000,
    unusuallyLow,
    explanation: `${comparison} ${
      unusuallyLow
        ? "Unusually low: under half the median, so check it's the right product from a genuine seller."
        : verdicts[score as keyof typeof verdicts]
    }`,
  };
}
