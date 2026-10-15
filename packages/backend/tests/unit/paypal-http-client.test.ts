import { describe, expect, it, vi } from "vitest";

import { PayPalApiError } from "../../src/integrations/paypal/paypal-client";
import {
  createPayPalHttpClient,
  formatPayPalAmount,
} from "../../src/integrations/paypal/paypal-http-client";

const baseUrl = "https://api-m.sandbox.paypal.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const tokenResponse = () => json({ access_token: "token-1", expires_in: 3600 });

function setup(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  const client = createPayPalHttpClient({
    clientId: "id",
    clientSecret: "secret",
    baseUrl,
    fetch: fetchMock,
  });
  const request = (index: number) => {
    const [url, init] = fetchMock.mock.calls[index]!;
    return {
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
  };
  return { client, fetchMock, request };
}

describe("formatPayPalAmount", () => {
  it("uses two decimals except for zero-decimal currencies", () => {
    expect(formatPayPalAmount(49.5, "USD")).toBe("49.50");
    expect(formatPayPalAmount(1200, "JPY")).toBe("1200");
  });
});

describe("PayPal HTTP client", () => {
  it.each([
    ["the live API", "https://api-m.paypal.com"],
    ["a look-alike host", "https://sandbox.paypal.com.evil.example"],
    ["a host merely containing 'sandbox'", "https://sandbox.evil.example"],
    ["plain http", "http://api-m.sandbox.paypal.com"],
  ])("refuses %s", (_label, baseUrl) => {
    expect(() =>
      createPayPalHttpClient({
        clientId: "id",
        clientSecret: "secret",
        baseUrl,
      }),
    ).toThrow(/Sandbox-only/);
  });

  it("ignores trailing slashes on the base URL", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(json({ id: "ORDER-1", status: "APPROVED" }));
    const client = createPayPalHttpClient({
      clientId: "id",
      clientSecret: "secret",
      baseUrl: `${baseUrl}///`,
      fetch: fetchMock,
    });

    await client.getOrder("ORDER-1");
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      `${baseUrl}/v2/checkout/orders/ORDER-1`,
    );
  });

  it("creates an AUTHORIZE order with the request id and approval link", async () => {
    const { client, request } = setup(
      tokenResponse(),
      json({
        id: "ORDER-1",
        status: "PAYER_ACTION_REQUIRED",
        links: [
          { rel: "self", href: `${baseUrl}/v2/checkout/orders/ORDER-1` },
          {
            rel: "payer-action",
            href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1",
          },
        ],
      }),
    );

    const order = await client.createOrder({
      amount: 49.5,
      currency: "USD",
      description: "Desk lamp",
      requestId: "order-user-key",
      returnUrl: "http://localhost:3000/return",
      cancelUrl: "http://localhost:3000/cancel",
    });

    expect(order).toEqual({
      orderId: "ORDER-1",
      status: "PAYER_ACTION_REQUIRED",
      approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1",
    });
    const call = request(1);
    expect(call.url).toBe(`${baseUrl}/v2/checkout/orders`);
    expect(call.headers["PayPal-Request-Id"]).toBe("order-user-key");
    expect(call.headers.Authorization).toBe("Bearer token-1");
    expect(call.body.intent).toBe("AUTHORIZE");
    expect(call.body.purchase_units[0].amount).toEqual({
      currency_code: "USD",
      value: "49.50",
    });
  });

  it("caches the access token across calls", async () => {
    const order = { id: "ORDER-1", status: "APPROVED" };
    const { client, fetchMock } = setup(
      tokenResponse(),
      json(order),
      json(order),
    );

    await client.getOrder("ORDER-1");
    await client.getOrder("ORDER-1");

    const tokenCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/v1/oauth2/token"),
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it("refreshes the token once on 401", async () => {
    const { client, fetchMock } = setup(
      tokenResponse(),
      json({ name: "AUTHENTICATION_FAILURE" }, 401),
      json({ access_token: "token-2", expires_in: 3600 }),
      json({ id: "ORDER-1", status: "APPROVED" }),
    );

    const order = await client.getOrder("ORDER-1");
    expect(order.status).toBe("APPROVED");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("reads the authorization from the authorize response", async () => {
    const { client, request } = setup(
      tokenResponse(),
      json({
        id: "ORDER-1",
        status: "COMPLETED",
        purchase_units: [
          {
            payments: { authorizations: [{ id: "AUTH-1", status: "CREATED" }] },
          },
        ],
      }),
    );

    const result = await client.authorizeOrder("ORDER-1", "authorize-p1");
    expect(result).toEqual({
      orderStatus: "COMPLETED",
      authorizationId: "AUTH-1",
      authorizationStatus: "CREATED",
    });
    expect(request(1).headers["PayPal-Request-Id"]).toBe("authorize-p1");
  });

  it("treats a 204 void response as VOIDED", async () => {
    const { client } = setup(
      tokenResponse(),
      new Response(null, { status: 204 }),
    );
    await expect(
      client.voidAuthorization("AUTH-1", "void-p1"),
    ).resolves.toEqual({
      authorizationStatus: "VOIDED",
    });
  });

  it("surfaces PayPal's issue code and debug id", async () => {
    const { client } = setup(
      tokenResponse(),
      json(
        {
          name: "UNPROCESSABLE_ENTITY",
          message: "The requested action could not be performed.",
          debug_id: "abc123",
          details: [{ issue: "ORDER_NOT_APPROVED" }],
        },
        422,
      ),
    );

    await expect(
      client.authorizeOrder("ORDER-1", "authorize-p1"),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 422,
        issue: "ORDER_NOT_APPROVED",
        debugId: "abc123",
      }),
    );
  });

  it("reports network failures as status 0", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("fetch failed"));
    const client = createPayPalHttpClient({
      clientId: "id",
      clientSecret: "secret",
      baseUrl,
      fetch: fetchMock,
    });

    const attempt = client.getOrder("ORDER-1");
    await expect(attempt).rejects.toBeInstanceOf(PayPalApiError);
    await expect(attempt).rejects.toMatchObject({
      status: 0,
      issue: "NETWORK",
    });
  });
});
