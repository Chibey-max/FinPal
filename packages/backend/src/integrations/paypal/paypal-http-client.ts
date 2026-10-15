import { z } from "zod";

import {
  PayPalApiError,
  type CreatePayPalOrderInput,
  type PayPalClient,
  type PayPalOrder,
} from "./paypal-client";

export interface PayPalHttpClientOptions {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

// Currencies PayPal accepts only as whole units.
const zeroDecimalCurrencies = new Set(["HUF", "JPY", "TWD"]);

export function formatPayPalAmount(amount: number, currency: string): string {
  return amount.toFixed(zeroDecimalCurrencies.has(currency) ? 0 : 2);
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
});

const linkSchema = z.object({ href: z.string(), rel: z.string() });

const orderResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  links: z.array(linkSchema).optional(),
});

const authorizeResponseSchema = z.object({
  status: z.string(),
  purchase_units: z
    .array(
      z.object({
        payments: z.object({
          authorizations: z
            .array(z.object({ id: z.string(), status: z.string() }))
            .min(1),
        }),
      }),
    )
    .min(1),
});

const captureResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
});

const voidResponseSchema = z.object({ status: z.string() });

const errorResponseSchema = z
  .object({
    name: z.string().optional(),
    message: z.string().optional(),
    debug_id: z.string().optional(),
    details: z.array(z.object({ issue: z.string().optional() })).optional(),
  })
  .partial();

function toOrder(body: z.infer<typeof orderResponseSchema>): PayPalOrder {
  const approveLink = body.links?.find(
    (link) => link.rel === "payer-action" || link.rel === "approve",
  );
  return {
    orderId: body.id,
    status: body.status,
    approveUrl: approveLink?.href ?? null,
  };
}

export function createPayPalHttpClient(
  options: PayPalHttpClientOptions,
): PayPalClient {
  // PayPal API base URLs have no path, so the origin is the whole base URL.
  const url = new URL(options.baseUrl);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".sandbox.paypal.com")
  ) {
    throw new Error(
      "FinPal is Sandbox-only; refusing a non-sandbox PayPal URL.",
    );
  }
  const baseUrl = url.origin;

  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 10_000;
  let token: { value: string; expiresAt: number } | undefined;

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(`${baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      throw new PayPalApiError(
        timedOut ? "PayPal request timed out." : "PayPal is unreachable.",
        0,
        timedOut ? "TIMEOUT" : "NETWORK",
      );
    }
  }

  async function toApiError(response: Response): Promise<PayPalApiError> {
    const raw: unknown = await response.json().catch(() => ({}));
    const parsed = errorResponseSchema.safeParse(raw);
    const body = parsed.success ? parsed.data : {};
    return new PayPalApiError(
      body.message ?? `PayPal request failed with ${response.status}.`,
      response.status,
      body.details?.[0]?.issue ?? body.name,
      body.debug_id ?? response.headers.get("paypal-debug-id") ?? undefined,
    );
  }

  async function accessToken(): Promise<string> {
    // Refresh a minute early so a token never expires mid-request.
    if (token && token.expiresAt - 60_000 > now()) {
      return token.value;
    }
    const credentials = btoa(`${options.clientId}:${options.clientSecret}`);
    const response = await send("/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) {
      throw await toApiError(response);
    }
    const body = tokenResponseSchema.parse(await response.json());
    token = {
      value: body.access_token,
      expiresAt: now() + body.expires_in * 1000,
    };
    return token.value;
  }

  async function request<T>(
    schema: z.ZodType<T>,
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; requestId?: string },
  ): Promise<T | undefined> {
    for (let attempt = 0; ; attempt++) {
      const response = await send(path, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });

      // A revoked or expired token: fetch a fresh one and retry once.
      if (response.status === 401 && attempt === 0) {
        token = undefined;
        continue;
      }
      if (!response.ok) {
        throw await toApiError(response);
      }
      if (response.status === 204) {
        return undefined;
      }
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) {
        throw new PayPalApiError(
          "PayPal returned an unexpected response.",
          response.status,
          "INVALID_RESPONSE",
          response.headers.get("paypal-debug-id") ?? undefined,
        );
      }
      return parsed.data;
    }
  }

  function required<T>(value: T | undefined, operation: string): T {
    if (value === undefined) {
      throw new PayPalApiError(
        `PayPal returned no body for ${operation}.`,
        204,
        "INVALID_RESPONSE",
      );
    }
    return value;
  }

  return {
    async createOrder(input: CreatePayPalOrderInput) {
      const body = await request(orderResponseSchema, "/v2/checkout/orders", {
        method: "POST",
        requestId: input.requestId,
        body: {
          intent: "AUTHORIZE",
          purchase_units: [
            {
              description: input.description.slice(0, 127),
              amount: {
                currency_code: input.currency,
                value: formatPayPalAmount(input.amount, input.currency),
              },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: "FinPal",
                shipping_preference: "NO_SHIPPING",
                user_action: "CONTINUE",
                return_url: input.returnUrl,
                cancel_url: input.cancelUrl,
              },
            },
          },
        },
      });
      return toOrder(required(body, "createOrder"));
    },

    async getOrder(orderId) {
      const body = await request(
        orderResponseSchema,
        `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
        { method: "GET" },
      );
      return toOrder(required(body, "getOrder"));
    },

    async authorizeOrder(orderId, requestId) {
      const body = required(
        await request(
          authorizeResponseSchema,
          `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`,
          { method: "POST", requestId, body: {} },
        ),
        "authorizeOrder",
      );
      const authorization = body.purchase_units[0]!.payments.authorizations[0]!;
      return {
        orderStatus: body.status,
        authorizationId: authorization.id,
        authorizationStatus: authorization.status,
      };
    },

    async captureAuthorization(authorizationId, requestId) {
      const body = required(
        await request(
          captureResponseSchema,
          `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
          { method: "POST", requestId, body: { final_capture: true } },
        ),
        "captureAuthorization",
      );
      return { captureId: body.id, captureStatus: body.status };
    },

    async voidAuthorization(authorizationId, requestId) {
      const body = await request(
        voidResponseSchema,
        `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
        { method: "POST", requestId },
      );
      // PayPal may answer 204 No Content, which still means VOIDED.
      return { authorizationStatus: body?.status ?? "VOIDED" };
    },
  };
}
