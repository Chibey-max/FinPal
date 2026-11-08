import { describe, expect, it } from "vitest";

import { createProposalRequestSchema, createProposalSchema } from "../src";

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
    ["a javascript offer URL", { offerUrl: "javascript:alert(1)" }],
  ])("rejects %s", (_label, override) => {
    expect(
      createProposalSchema.safeParse({ ...validProposal, ...override }).success,
    ).toBe(false);
  });

  it("accepts the chosen listing URL for agent proposals", () => {
    const result = createProposalSchema.parse({
      ...validProposal,
      source: "AGENT",
      offerUrl: "https://www.bestbuy.com/site/item",
      offerMerchant: "bestbuy.com",
    });
    expect(result.offerUrl).toBe("https://www.bestbuy.com/site/item");
    expect(result.offerMerchant).toBe("bestbuy.com");
  });
});

describe("createProposalRequestSchema", () => {
  it("does not accept the chosen listing from the public API", () => {
    const result = createProposalRequestSchema.parse({
      ...validProposal,
      offerUrl: "https://www.bestbuy.com/site/item",
      offerMerchant: "bestbuy.com",
    });
    expect(result).not.toHaveProperty("offerUrl");
    expect(result).not.toHaveProperty("offerMerchant");
  });
});
