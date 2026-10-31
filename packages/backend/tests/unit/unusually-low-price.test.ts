import type { ConstraintCheck, OfferLookup } from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import { decide } from "../../src/domain/decision-table";
import { scoreQuality } from "../../src/domain/quality-score";

const offer = (price: number) => ({
  productId: `p${price}`,
  title: "Sony WH-1000XM5",
  merchant: "shop.com",
  price,
  currency: "USD",
  url: "https://shop.com/p",
});

const lookup = (prices: number[]) =>
  ({
    query: "q",
    currency: "USD",
    status: "OK",
    offers: prices.map(offer),
    excluded: {},
    fetchedAt: "",
    providerError: null,
  }) as unknown as OfferLookup;

const passing: ConstraintCheck = {
  constraints: "PASS",
  amount: "UNDER_CAP",
  reasons: [],
};

const decideAt = (
  proposedPrice: number,
  constraintCheck: ConstraintCheck = passing,
) => {
  const quality = scoreQuality({
    proposedPrice,
    currency: "USD",
    lookup: lookup([290, 300, 310]),
  });
  return {
    quality,
    decision: decide({ constraintCheck, quality, trust: "PASS" }),
  };
};

describe("unusually low prices", () => {
  it("sends a price 90% under the median to a person", () => {
    const { quality, decision } = decideAt(29);
    expect(quality.score).toBe("GOOD");
    expect(quality.explanation).toContain("Unusually low");
    expect(quality.explanation).not.toContain("no more than 5% above");
    expect(decision.outcome).toBe("MANUAL_REVIEW");
    expect(decision.reasons.map((r) => r.code)).toEqual([
      "PRICE_UNUSUALLY_LOW",
    ]);
  });

  it("treats exactly half the median as a normal good price", () => {
    const { quality, decision } = decideAt(150);
    expect(quality.explanation).toContain("no more than 5% above");
    expect(decision.outcome).toBe("AUTO_APPROVE");
  });

  it("flags one cent under half", () => {
    expect(decideAt(149.99).decision.outcome).toBe("MANUAL_REVIEW");
  });

  it("still auto-approves a normal discount", () => {
    expect(decideAt(180).decision.outcome).toBe("AUTO_APPROVE");
  });

  it("lets a block win over review", () => {
    const { decision } = decideAt(29, {
      constraints: "PASS",
      amount: "OVER_CAP",
      reasons: [],
    });
    expect(decision.outcome).toBe("BLOCK");
  });
});
