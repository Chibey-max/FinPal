import { describe, expect, it } from "vitest";

import { createProposalSchema } from "../src";

const validProposal = {
  productName: "Noise-cancelling headphones",
  proposedPrice: 199.99,
  currency: "usd",
  source: "MANUAL",
} as const;

describe("createProposalSchema", () => {
  it("accepts a valid manual proposal and uppercases the currency", () => {
    const result = createProposalSchema.parse(validProposal);
    expect(result.currency).toBe("USD");
  });

  it("trims the product name", () => {
    const result = createProposalSchema.parse({
      ...validProposal,
      productName: "  Desk lamp  ",
    });
    expect(result.productName).toBe("Desk lamp");
  });

  it.each([
    ["an empty product name", { productName: "   " }],
    ["a zero price", { proposedPrice: 0 }],
    ["a negative price", { proposedPrice: -5 }],
    ["a non-ISO currency", { currency: "US" }],
    ["an unknown source", { source: "EMAIL" }],
  ])("rejects %s", (_label, override) => {
    expect(
      createProposalSchema.safeParse({ ...validProposal, ...override }).success,
    ).toBe(false);
  });
});
