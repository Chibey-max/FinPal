import { describe, expect, it } from "vitest";

import {
  Channel3ApiError,
  type Channel3Client,
  type Channel3Offer,
  type Channel3Product,
} from "../../src/integrations/channel3/channel3-client";
import {
  createComparableOffersService,
  normalizeOffers,
} from "../../src/use-cases/comparable-offers";

function offer(overrides: Partial<Channel3Offer> = {}): Channel3Offer {
  return {
    url: "https://shop.example/item",
    domain: "shop.example",
    price: 100,
    currency: "USD",
    availability: "InStock",
    condition: "new",
    ...overrides,
  };
}

function product(id: string, offers: Channel3Offer[]): Channel3Product {
  return { id, title: `Product ${id}`, offers };
}

const fixedNow = () => new Date("2026-10-19T09:00:00Z");

function serviceReturning(result: Channel3Product[] | Error) {
  const calls: unknown[] = [];
  const channel3: Channel3Client = {
    async search(input) {
      calls.push(input);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return {
    calls,
    service: createComparableOffersService({ channel3, now: fixedNow }),
  };
}

describe("normalizeOffers", () => {
  it("keeps usable offers, cheapest first, rounded to cents", () => {
    const { offers } = normalizeOffers(
      [
        product("p1", [offer({ domain: "a.example", price: 120.004 })]),
        product("p2", [offer({ domain: "B.Example", price: 95.5 })]),
      ],
      "USD",
    );
    expect(offers.map((o) => [o.merchant, o.price])).toEqual([
      ["b.example", 95.5],
      ["a.example", 120],
    ]);
  });

  it("excludes other currencies instead of converting them", () => {
    const { offers, excluded } = normalizeOffers(
      [
        product("p1", [
          offer({ currency: "EUR" }),
          offer({ domain: "b.example", currency: null }),
          offer({ domain: "c.example", currency: "usd" }),
        ]),
      ],
      "USD",
    );
    expect(offers).toHaveLength(1);
    expect(excluded.currencyMismatch).toBe(2);
  });

  it("excludes out-of-stock and used listings", () => {
    const { excluded } = normalizeOffers(
      [
        product("p1", [
          offer({ availability: "OutOfStock" }),
          offer({ domain: "b.example", condition: "used" }),
        ]),
      ],
      "USD",
    );
    expect(excluded.unavailable).toBe(2);
  });

  it("excludes missing, zero, negative and non-finite prices", () => {
    const { excluded } = normalizeOffers(
      [
        product("p1", [
          offer({ price: null }),
          offer({ price: 0 }),
          offer({ price: -5 }),
          offer({ price: Number.NaN }),
        ]),
      ],
      "USD",
    );
    expect(excluded.invalidPrice).toBe(4);
  });

  it("counts the same merchant listing a product twice once", () => {
    const { offers, excluded } = normalizeOffers(
      [
        product("p1", [
          offer({ url: "https://shop.example/a" }),
          offer({ url: "https://shop.example/b", domain: "SHOP.example" }),
        ]),
        product("p2", [offer()]),
      ],
      "USD",
    );
    expect(offers).toHaveLength(2);
    expect(excluded.duplicate).toBe(1);
  });

  it("only keeps http(s) links, so provider data cannot inject script", () => {
    const { offers, excluded } = normalizeOffers(
      [
        product("p1", [
          offer({ url: "javascript:alert(1)" }),
          offer({ domain: "b.example", url: "data:text/html,<script>" }),
          offer({ domain: "c.example", url: "not a url" }),
          offer({ domain: "d.example", url: "http://d.example/item" }),
        ]),
      ],
      "USD",
    );
    expect(offers.map((o) => o.url)).toEqual(["http://d.example/item"]);
    expect(excluded.invalidUrl).toBe(3);
  });
});

describe("comparable offers service", () => {
  const threeOffers = [
    product("p1", [
      offer({ domain: "a.example", price: 90 }),
      offer({ domain: "b.example", price: 100 }),
      offer({ domain: "c.example", price: 110 }),
    ]),
  ];

  it("returns OK with at least three usable offers", async () => {
    const { service, calls } = serviceReturning(threeOffers);
    const result = await service.lookup({
      query: "Desk lamp",
      currency: "usd",
    });

    expect(calls).toEqual([{ query: "Desk lamp", currency: "USD" }]);
    expect(result).toMatchObject({
      status: "OK",
      currency: "USD",
      providerError: null,
      fetchedAt: "2026-10-19T09:00:00.000Z",
    });
    expect(result.offers).toHaveLength(3);
  });

  it("returns INSUFFICIENT_OFFERS below three usable offers", async () => {
    const { service } = serviceReturning([
      product("p1", [
        offer({ domain: "a.example" }),
        offer({ domain: "b.example" }),
        offer({ domain: "c.example", currency: "EUR" }),
      ]),
    ]);
    const result = await service.lookup({ query: "Lamp", currency: "USD" });

    expect(result.status).toBe("INSUFFICIENT_OFFERS");
    expect(result.offers).toHaveLength(2);
    expect(result.excluded.currencyMismatch).toBe(1);
  });

  it("returns INSUFFICIENT_OFFERS when nothing matches", async () => {
    const { service } = serviceReturning([]);
    expect(
      (await service.lookup({ query: "Lamp", currency: "USD" })).status,
    ).toBe("INSUFFICIENT_OFFERS");
  });

  it("does not call Channel3 for an unsupported currency", async () => {
    const { service, calls } = serviceReturning(threeOffers);
    const result = await service.lookup({ query: "Lamp", currency: "JPY" });

    expect(result.status).toBe("UNSUPPORTED_CURRENCY");
    expect(calls).toEqual([]);
  });

  it.each([
    "TIMEOUT",
    "QUOTA_EXCEEDED",
    "UNAUTHORIZED",
    "PROVIDER_ERROR",
  ] as const)(
    "degrades to UNAVAILABLE on %s instead of throwing",
    async (code) => {
      const { service } = serviceReturning(new Channel3ApiError("x", code, 0));
      const result = await service.lookup({ query: "Lamp", currency: "USD" });

      expect(result).toMatchObject({
        status: "UNAVAILABLE",
        providerError: code,
        offers: [],
      });
    },
  );

  it("still throws unexpected programming errors", async () => {
    const { service } = serviceReturning(new TypeError("bug"));
    await expect(
      service.lookup({ query: "Lamp", currency: "USD" }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
