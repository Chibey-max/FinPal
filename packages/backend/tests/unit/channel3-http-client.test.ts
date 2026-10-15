import { describe, expect, it, vi } from "vitest";

import { Channel3ApiError } from "../../src/integrations/channel3/channel3-client";
import { createChannel3HttpClient } from "../../src/integrations/channel3/channel3-http-client";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  const client = createChannel3HttpClient({
    apiKey: "key-1",
    fetch: fetchMock,
  });
  return { client, fetchMock };
}

const search = { query: "Sony WH-1000XM5", currency: "GBP" as const };

describe("Channel3 HTTP client", () => {
  it("sends the API key, query, filters and market for the currency", async () => {
    const { client, fetchMock } = setup(json({ products: [] }));
    await client.search(search);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.trychannel3.com/v1/search");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(
      "key-1",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "Sony WH-1000XM5",
      limit: 30,
      filters: { availability: ["InStock"], conditions: ["new"] },
      config: { currency: "GBP", country: "GB" },
    });
  });

  it("reads both documented price shapes", async () => {
    const { client } = setup(
      json({
        products: [
          {
            id: "p1",
            title: "Headphones",
            offers: [
              {
                url: "https://a.example/1",
                domain: "a.example",
                price: { price: 279, compare_at_price: 299, currency: "GBP" },
                availability: "InStock",
                condition: "new",
              },
              {
                url: "https://b.example/1",
                domain: "b.example",
                price: { amount: 265.5, currency: "GBP" },
                availability: "InStock",
              },
            ],
          },
        ],
      }),
    );

    const [product] = await client.search(search);
    expect(product!.offers.map((o) => [o.price, o.currency])).toEqual([
      [279, "GBP"],
      [265.5, "GBP"],
    ]);
    expect(product!.offers[1]!.condition).toBeNull();
  });

  it("skips malformed products and offers instead of failing the search", async () => {
    const { client } = setup(
      json({
        products: [
          { title: "no id" },
          {
            id: "p1",
            title: "Ok",
            offers: [
              { domain: "missing-url.example" },
              { url: "u", domain: "d" },
            ],
          },
        ],
      }),
    );

    const products = await client.search(search);
    expect(products).toHaveLength(1);
    expect(products[0]!.offers).toEqual([
      {
        url: "u",
        domain: "d",
        price: null,
        currency: null,
        availability: null,
        condition: null,
      },
    ]);
  });

  it.each([
    [401, "UNAUTHORIZED"],
    [402, "QUOTA_EXCEEDED"],
    [422, "INVALID_REQUEST"],
    [429, "RATE_LIMITED"],
  ])("maps HTTP %i to %s without retrying", async (status, code) => {
    const { client, fetchMock } = setup(json({ detail: "x" }, status));
    await expect(client.search(search)).rejects.toMatchObject({ code, status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once after a server error, then succeeds", async () => {
    const { client, fetchMock } = setup(
      json({}, 500),
      json({ products: [{ id: "p1", title: "Ok", offers: [] }] }),
    );
    await expect(client.search(search)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second timeout", async () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    const { client, fetchMock } = setup(timeout, timeout);

    const attempt = client.search(search);
    await expect(attempt).rejects.toBeInstanceOf(Channel3ApiError);
    await expect(attempt).rejects.toMatchObject({ code: "TIMEOUT", status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a response without a products array", async () => {
    const { client } = setup(json({ results: [] }));
    await expect(client.search(search)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
