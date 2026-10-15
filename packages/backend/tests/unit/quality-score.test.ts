import type { OfferLookup } from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import { medianHalfCents, scoreQuality } from "../../src/domain/quality-score";
import { createQualityScoreService } from "../../src/services/quality-score-service";

function lookup(
  prices: number[],
  overrides: Partial<OfferLookup> = {},
): OfferLookup {
  return {
    status: prices.length >= 3 ? "OK" : "INSUFFICIENT_OFFERS",
    query: "Desk lamp",
    currency: "USD",
    offers: prices.map((price, index) => ({
      productId: `p${index}`,
      title: "Desk lamp",
      merchant: `shop${index}.example`,
      price,
      currency: "USD",
      url: `https://shop${index}.example/lamp`,
    })),
    excluded: {
      currencyMismatch: 0,
      unavailable: 0,
      invalidPrice: 0,
      invalidUrl: 0,
      duplicate: 0,
    },
    providerError: null,
    fetchedAt: "2026-10-20T09:00:00.000Z",
    ...overrides,
  };
}

// Median 100.00 with an odd number of offers.
const median100 = lookup([90, 100, 110]);

const score = (proposedPrice: number, offers = median100) =>
  scoreQuality({ proposedPrice, currency: "USD", lookup: offers }).score;

describe("medianHalfCents", () => {
  it("takes the middle value of an odd count", () => {
    expect(medianHalfCents([110, 90, 100])).toBe(20_000);
  });

  it("averages the two middle values of an even count exactly", () => {
    // (100.00 + 100.01) / 2 = 100.005 -> 20001 half-cents, no rounding.
    expect(medianHalfCents([99.99, 100.01, 100, 100.02])).toBe(20_001);
  });
});

describe("Quality Score v1 bands", () => {
  it.each([
    [50, "GOOD"],
    [100, "GOOD"],
    [105, "GOOD"], // exactly median x 1.05: inclusive
    [105.01, "FAIR"], // one cent over
    [120, "FAIR"], // exactly median x 1.20: inclusive
    [120.01, "POOR"], // one cent over
    [500, "POOR"],
  ] as const)("scores %d against a median of 100 as %s", (price, expected) => {
    expect(score(price)).toBe(expected);
  });

  it("uses the exact even-count median at the GOOD boundary", () => {
    // Median 100.005; x 1.05 = 105.00525, so 105.00 is GOOD and 105.01 FAIR.
    const evenOffers = lookup([99.99, 100, 100.01, 100.02]);
    expect(score(105, evenOffers)).toBe("GOOD");
    expect(score(105.01, evenOffers)).toBe("FAIR");
  });

  it("is not thrown off by floating-point error at a boundary", () => {
    // Naive float maths gets these wrong: 10.2 * 1.05 = 10.709999999999999
    // and 1.5 * 1.2 = 1.7999999999999998, so a price exactly on the bound
    // would drop a band. Integer cents keep the inclusive bound exact.
    expect(10.71 <= 10.2 * 1.05).toBe(false);
    expect(score(10.71, lookup([10, 10.2, 10.4]))).toBe("GOOD");
    expect(score(10.72, lookup([10, 10.2, 10.4]))).toBe("FAIR");

    expect(1.8 <= 1.5 * 1.2).toBe(false);
    expect(score(1.8, lookup([1.4, 1.5, 1.6]))).toBe("FAIR");
    expect(score(1.81, lookup([1.4, 1.5, 1.6]))).toBe("POOR");
  });

  it("reports the median, lowest offer, ratio and references", () => {
    const result = scoreQuality({
      proposedPrice: 104,
      currency: "usd",
      lookup: median100,
    });
    expect(result).toMatchObject({
      score: "GOOD",
      currency: "USD",
      offerCount: 3,
      medianPrice: 100,
      lowestPrice: 90,
      ratioToMedian: 1.04,
      thresholds: { goodMaxRatio: 1.05, fairMaxRatio: 1.2 },
      offerStatus: "OK",
    });
    expect(result.references).toHaveLength(3);
    expect(result.explanation).toBe(
      "$104.00 is 4.0% above the median of $100.00 across 3 offers (lowest $90.00). Good: within 5% of the median.",
    );
  });

  it("explains prices below the median", () => {
    const result = scoreQuality({
      proposedPrice: 95,
      currency: "USD",
      lookup: median100,
    });
    expect(result.explanation).toContain("5.0% below the median");
  });
});

describe("Insufficient data", () => {
  it("needs at least three offers", () => {
    const result = scoreQuality({
      proposedPrice: 100,
      currency: "USD",
      lookup: lookup([100, 101]),
    });
    expect(result).toMatchObject({
      score: "INSUFFICIENT_DATA",
      offerCount: 2,
      medianPrice: null,
      lowestPrice: 100,
      ratioToMedian: null,
    });
    expect(result.explanation).toBe(
      "Fewer than 3 comparable offers were found, so the price cannot be scored. This purchase needs manual review.",
    );
  });

  it("treats three offers as enough", () => {
    expect(score(100, lookup([99, 100, 101]))).toBe("GOOD");
  });

  it.each([
    ["UNAVAILABLE", "The price comparison service was unavailable"],
    [
      "UNSUPPORTED_CURRENCY",
      "Comparable prices are not available in this currency",
    ],
  ] as const)("is returned when the lookup is %s", (status, reason) => {
    const result = scoreQuality({
      proposedPrice: 100,
      currency: "USD",
      lookup: lookup([], { status }),
    });
    expect(result.score).toBe("INSUFFICIENT_DATA");
    expect(result.explanation).toContain(reason);
  });

  it("never scores against a different currency", () => {
    // Offers priced in USD cannot score a EUR proposal, even with 3 offers.
    const result = scoreQuality({
      proposedPrice: 100,
      currency: "EUR",
      lookup: median100,
    });
    expect(result.score).toBe("INSUFFICIENT_DATA");
    expect(result.explanation).toContain("different currency");
  });

  it("ignores a lookup that claims OK but has too few offers", () => {
    expect(score(100, lookup([100, 100], { status: "OK" }))).toBe(
      "INSUFFICIENT_DATA",
    );
  });
});

describe("quality score service", () => {
  it("looks up offers for the product and scores the proposal", async () => {
    const queries: unknown[] = [];
    const service = createQualityScoreService({
      offers: {
        async lookup(query) {
          queries.push(query);
          return median100;
        },
      },
    });

    const result = await service.score({
      productName: "Desk lamp",
      proposedPrice: 110,
      currency: "usd",
    });

    expect(queries).toEqual([{ query: "Desk lamp", currency: "USD" }]);
    expect(result.score).toBe("FAIR");
  });
});
