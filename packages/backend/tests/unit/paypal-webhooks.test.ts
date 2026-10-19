import { beforeEach, describe, expect, it } from "vitest";

import {
  createPaypalWebhookService,
  WebhookError,
} from "../../src/use-cases/paypal-webhooks";
import {
  createFakePayPal,
  createInMemoryAudit,
  createInMemoryPayments,
} from "../support/in-memory";

const userId = "11111111-1111-4111-8111-111111111111";
const decisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const headers = {
  authAlgo: "SHA256withRSA",
  certUrl: "https://api.sandbox.paypal.com/cert",
  transmissionId: "tx-1",
  transmissionSig: "sig",
  transmissionTime: "2026-10-28T12:00:00Z",
};

describe("paypal webhook service", () => {
  let paypal: ReturnType<typeof createFakePayPal>;
  let payments: ReturnType<typeof createInMemoryPayments>;
  let audit: ReturnType<typeof createInMemoryAudit>;
  const eventIds = new Set<string>();

  beforeEach(() => {
    paypal = createFakePayPal();
    payments = createInMemoryPayments();
    audit = createInMemoryAudit();
    eventIds.clear();
  });

  function service(webhookId: string | null = "WH-1") {
    return createPaypalWebhookService({
      paypal: paypal.client,
      payments,
      audit: audit.log,
      webhookId: webhookId ?? undefined,
      events: {
        async tryInsert(event) {
          if (eventIds.has(event.id)) return false;
          eventIds.add(event.id);
          return true;
        },
      },
    });
  }

  it("rejects when webhook id is not configured", async () => {
    await expect(
      service(null).handle(headers, { id: "EVT-1", event_type: "X" }),
    ).rejects.toMatchObject({
      name: "WebhookError",
      code: "NOT_CONFIGURED",
    } satisfies Partial<WebhookError>);
  });

  it("is idempotent for duplicate event ids", async () => {
    await payments.insert({
      userId,
      decisionId,
      idempotencyKey: "key-1",
      status: "CREATED",
      amount: 10,
      currency: "USD",
      paypalOrderId: "ORDER-1",
      paypalOrderStatus: "PAYER_ACTION_REQUIRED",
      paypalAuthorizationId: null,
      paypalAuthorizationStatus: null,
      paypalCaptureId: null,
      paypalCaptureStatus: null,
      approveUrl: null,
    });

    const body = {
      id: "EVT-DUP",
      event_type: "CHECKOUT.ORDER.APPROVED",
      resource_type: "checkout-order",
      resource: { id: "ORDER-1", status: "APPROVED" },
    };

    const first = await service().handle(headers, body);
    const second = await service().handle(headers, body);

    expect(first).toEqual({ status: "processed", eventId: "EVT-DUP" });
    expect(second).toEqual({ status: "duplicate", eventId: "EVT-DUP" });
    expect(payments.rows[0]!.status).toBe("APPROVED");
    expect(audit.types()).toEqual(["PAYMENT_APPROVED"]);
  });
});
