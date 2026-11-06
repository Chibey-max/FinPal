import { z } from "zod";

import {
  PayPalApiError,
  type CreatePayPalOrderInput,
  type CreatePayPalPayoutInput,
  type PayPalBalances,
  type PayPalClient,
  type PayPalOrder,
  type PayPalPayout,
  type PayPalPayoutItem,
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

const verifyWebhookResponseSchema = z.object({
  verification_status: z.string(),
});

const balancesResponseSchema = z.object({
  balances: z
    .array(
      z.object({
        currency: z.string(),
        primary: z.boolean().optional(),
        total_balance: z
          .object({ currency_code: z.string(), value: z.string() })
          .optional(),
        available_balance: z
          .object({ currency_code: z.string(), value: z.string() })
          .optional(),
      }),
    )
    .min(1),
  // Account-level times, not per balance.
  as_of_time: z.string().optional(),
  last_refresh_time: z.string().optional(),
});

// A failed or unclaimed item says why, e.g. RECEIVER_COUNTRY_NOT_ALLOWED.
const payoutItemErrorSchema = z
  .object({ name: z.string().optional(), message: z.string().optional() })
  .optional();

const payoutCreateResponseSchema = z.object({
  batch_header: z.object({
    payout_batch_id: z.string(),
    batch_status: z.string(),
  }),
  // Present on some responses immediately; otherwise we poll getPayoutItem.
  items: z
    .array(
      z.object({
        payout_item_id: z.string().optional(),
        transaction_status: z.string().optional(),
        errors: payoutItemErrorSchema,
      }),
    )
    .optional(),
});

const payoutItemResponseSchema = z.object({
  payout_item_id: z.string(),
  transaction_status: z.string(),
  payout_batch_id: z.string().optional(),
  errors: payoutItemErrorSchema,
});

function toBalances(
  body: z.infer<typeof balancesResponseSchema>,
): PayPalBalances {
  const row =
    body.balances.find((entry) => entry.primary && entry.available_balance) ??
    body.balances.find((entry) => entry.available_balance) ??
    body.balances[0]!;
  const available = row.available_balance ?? row.total_balance;
  if (!available) {
    throw new PayPalApiError(
      "PayPal returned balances without an available amount.",
      502,
      "INVALID_RESPONSE",
    );
  }
  return {
    available: Number(available.value),
    currency: available.currency_code,
    // PayPal refreshes balances with a delay of up to 3 hours; the last
    // refresh is how current the figure really is.
    asOf: body.last_refresh_time ?? body.as_of_time ?? new Date().toISOString(),
  };
}

function toPayout(
  body: z.infer<typeof payoutCreateResponseSchema>,
): PayPalPayout {
  const item = body.items?.[0];
  return {
    batchId: body.batch_header.payout_batch_id,
    batchStatus: body.batch_header.batch_status,
    payoutItemId: item?.payout_item_id ?? null,
    transactionStatus: item?.transaction_status ?? null,
    errorMessage: item?.errors?.message ?? null,
  };
}

function toPayoutItem(
  body: z.infer<typeof payoutItemResponseSchema>,
): PayPalPayoutItem {
  return {
    payoutItemId: body.payout_item_id,
    transactionStatus: body.transaction_status,
    payoutBatchId: body.payout_batch_id ?? null,
    errorMessage: body.errors?.message ?? null,
  };
}

const errorResponseSchema = z
  .object({
    name: z.string().optional(),
    message: z.string().optional(),
    debug_id: z.string().optional(),
    details: z.array(z.object({ issue: z.string().optional() })).optional(),
    links: z.array(z.object({ href: z.string() })).optional(),
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
      body.links?.map((link) => link.href) ?? [],
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
                ...(input.items?.length
                  ? {
                      breakdown: {
                        item_total: {
                          currency_code: input.currency,
                          value: formatPayPalAmount(
                            input.amount,
                            input.currency,
                          ),
                        },
                      },
                    }
                  : {}),
              },
              ...(input.items?.length
                ? {
                    items: input.items.map((item) => ({
                      name: item.name.slice(0, 127),
                      quantity: "1",
                      unit_amount: {
                        currency_code: input.currency,
                        value: formatPayPalAmount(item.amount, input.currency),
                      },
                    })),
                  }
                : {}),
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

    async verifyWebhookSignature(input) {
      const body = await request(
        verifyWebhookResponseSchema,
        "/v1/notifications/verify-webhook-signature",
        {
          method: "POST",
          body: {
            auth_algo: input.authAlgo,
            cert_url: input.certUrl,
            transmission_id: input.transmissionId,
            transmission_sig: input.transmissionSig,
            transmission_time: input.transmissionTime,
            webhook_id: input.webhookId,
            webhook_event: input.webhookEvent,
          },
        },
      );
      return (
        required(body, "verifyWebhookSignature").verification_status ===
        "SUCCESS"
      );
    },

    async getBalances() {
      const body = await request(
        balancesResponseSchema,
        "/v1/reporting/balances?currency_code=USD",
        { method: "GET" },
      );
      return toBalances(required(body, "getBalances"));
    },

    async createPayout(input: CreatePayPalPayoutInput) {
      const body = await request(
        payoutCreateResponseSchema,
        "/v1/payments/payouts",
        {
          method: "POST",
          requestId: input.requestId,
          body: {
            sender_batch_header: {
              sender_batch_id: input.senderBatchId,
              email_subject: "You received money from FinPal",
              email_message:
                input.memo?.slice(0, 1000) ?? "Sent via FinPal Sandbox",
            },
            items: [
              {
                recipient_type: "EMAIL",
                amount: {
                  value: formatPayPalAmount(input.amount, input.currency),
                  currency: input.currency,
                },
                receiver: input.recipientEmail,
                note: input.memo?.slice(0, 1000) ?? undefined,
                sender_item_id: input.senderBatchId.slice(0, 63),
              },
            ],
          },
        },
      );
      return toPayout(required(body, "createPayout"));
    },

    async getPayoutBatch(batchId: string) {
      const body = await request(
        payoutCreateResponseSchema,
        `/v1/payments/payouts/${encodeURIComponent(batchId)}`,
        { method: "GET" },
      );
      return toPayout(required(body, "getPayoutBatch"));
    },

    async getPayoutItem(payoutItemId: string) {
      const body = await request(
        payoutItemResponseSchema,
        `/v1/payments/payouts-item/${encodeURIComponent(payoutItemId)}`,
        { method: "GET" },
      );
      return toPayoutItem(required(body, "getPayoutItem"));
    },
  };
}
