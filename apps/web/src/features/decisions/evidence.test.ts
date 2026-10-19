import type { QualityScoreResult } from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import {
  constraintChecklist,
  describeTrustEvidence,
  priceBand,
  ratioLabel,
} from "./evidence";

const quality = (
  over: Partial<QualityScoreResult> = {},
): QualityScoreResult => ({
  score: "GOOD",
  explanation: "",
  proposedPrice: 329,
  currency: "USD",
  offerCount: 3,
  medianPrice: 339.99,
  lowestPrice: 328,
  ratioToMedian: 0.9677,
  thresholds: { goodMaxRatio: 1.05, fairMaxRatio: 1.2 },
  offerStatus: "OK",
  references: [328, 339.99, 349.99].map((price, i) => ({
    productId: `p${i}`,
    title: "x",
    merchant: `m${i}`,
    price,
    currency: "USD",
    url: "https://example.com",
  })),
  ...over,
});

describe("decision evidence", () => {
  it("says automatic approval is disabled when no constraints exist", () => {
    expect(constraintChecklist(null)).toEqual([
      expect.objectContaining({ mark: "NONE", tone: "warn" }),
    ]);
  });

  it("marks the failing rules from the stored constraint check", () => {
    const rows = constraintChecklist({
      constraints: "FAIL",
      amount: "OVER_CAP",
      reasons: [
        { code: "OUTSIDE_TIME_WINDOW", message: "Outside." },
        { code: "OVER_DAILY_CAP", message: "Over daily." },
      ],
    });
    expect(rows.map((r) => r.mark)).toEqual([
      "FAIL",
      "PASS",
      "PASS",
      "OVER",
      "PASS",
    ]);
  });

  it("skips cap comparisons on a currency mismatch instead of guessing", () => {
    const rows = constraintChecklist({
      constraints: "FAIL",
      amount: "OVER_CAP",
      reasons: [{ code: "CURRENCY_MISMATCH", message: "EUR vs USD." }],
    });
    expect(rows[0]).toMatchObject({ label: "Currency", mark: "FAIL" });
    expect(rows.slice(1).every((r) => r.mark === "SKIP")).toBe(true);
  });

  it("lays out the band with zones in order and markers inside it", () => {
    const band = priceBand(quality())!;
    expect(band.goodWidth).toBeGreaterThan(0);
    expect(band.poorLeft).toBeCloseTo(band.goodWidth + band.fairWidth);
    for (const x of [band.median, band.proposed, ...band.dots]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
    }
    expect(band.proposed).toBeLessThan(band.median);
  });

  it("has no band or ratio without a median", () => {
    const q = quality({
      medianPrice: null,
      ratioToMedian: null,
      score: "INSUFFICIENT_DATA",
    });
    expect(priceBand(q)).toBeNull();
    expect(ratioLabel(q)).toBe("—");
    expect(ratioLabel(quality())).toBe("96.8%");
  });
});

describe("describeTrustEvidence", () => {
  it("says nothing when KERNEL is not configured", () => {
    expect(
      describeTrustEvidence({ reason: "kernel_not_configured" }),
    ).toBeNull();
    expect(describeTrustEvidence({})).toBeNull();
  });

  it("names the merchant KERNEL visited and the HTTP status", () => {
    expect(
      describeTrustEvidence({
        merchant: "bestbuy.com",
        url: "https://bestbuy.com/p/1",
        status: 200,
      }),
    ).toBe("Checked bestbuy.com · HTTP 200");
  });

  it("falls back to the URL host and explains failures", () => {
    expect(
      describeTrustEvidence({
        url: "https://shop.example/item",
        reason: "curl_failed",
        httpStatus: 503,
      }),
    ).toBe("Checked shop.example · HTTP 503 · curl failed");
  });

  it("flags simulated results from mock mode", () => {
    expect(
      describeTrustEvidence({ simulated: true, merchant: "amazon.com" }),
    ).toBe("Checked amazon.com · simulated");
  });
});
