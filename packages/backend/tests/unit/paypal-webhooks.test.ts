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

  it("rejects missing signature headers before calling PayPal", async () => {
    await expect(
      service().handle(
        { ...headers, transmissionSig: "" },
        { id: "EVT-1", event_type: "X" },
      ),
    ).rejects.toMatchObject({
      name: "WebhookError",
      code: "INVALID_SIGNATURE",
    } satisfies Partial<WebhookError>);
    expect(paypal.calls).not.toContain("verifyWebhookSignature");
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

  describe("a transfer waiting to be claimed", () => {
    const orderId = "ORDER-T";
    async function transfer(payeeEmail: string | null = "someone@example.com") {
      return payments.insert({
        userId,
        decisionId,
        basketId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        payeeEmail,
        idempotencyKey: "transfer-key",
        status: "CAPTURED",
        amount: 100,
        currency: "USD",
        paypalOrderId: orderId,
        paypalOrderStatus: "COMPLETED",
        paypalAuthorizationId: payeeEmail ? null : "AUTH-1",
        paypalAuthorizationStatus: null,
        paypalCaptureId: "CAP-1",
        paypalCaptureStatus: "PENDING",
        approveUrl: null,
      });
    }
    const captureEvent = (eventType: string, status: string, id = "EVT-C") => ({
      id,
      event_type: eventType,
      resource_type: "capture",
      resource: {
        id: "CAP-1",
        status,
        supplementary_data: { related_ids: { order_id: orderId } },
      },
    });
    const windowAround = [
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 86_400_000),
    ] as const;

    it("records that the recipient claimed it", async () => {
      const row = await transfer();
      await service().handle(
        headers,
        captureEvent("PAYMENT.CAPTURE.COMPLETED", "COMPLETED"),
      );
      expect(await payments.findById(userId, row.id)).toMatchObject({
        status: "CAPTURED",
        paypalCaptureStatus: "COMPLETED",
      });
    });

    it.each([
      ["PAYMENT.CAPTURE.DENIED", "DENIED"],
      ["PAYMENT.CAPTURE.REVERSED", "REVERSED"],
    ])("gives the budget back on %s", async (eventType, status) => {
      const row = await transfer();
      expect(await payments.sumCommitted(userId, "USD", ...windowAround)).toBe(
        100,
      );
      await service().handle(headers, captureEvent(eventType, status));
      expect(await payments.findById(userId, row.id)).toMatchObject({
        status: "REFUNDED",
        paypalCaptureStatus: status,
      });
      expect(await payments.sumCommitted(userId, "USD", ...windowAround)).toBe(
        0,
      );
      expect(audit.events.map((e) => e.type)).toContain("PAYMENT_RETURNED");
    });

    it("applies a repeated delivery only once", async () => {
      await transfer();
      const event = captureEvent("PAYMENT.CAPTURE.REVERSED", "REVERSED");
      await service().handle(headers, event);
      await service().handle(headers, event);
      expect(
        audit.events.filter((e) => e.type === "PAYMENT_RETURNED"),
      ).toHaveLength(1);
    });

    it("leaves ordinary purchases alone", async () => {
      const row = await transfer(null);
      await service().handle(
        headers,
        captureEvent("PAYMENT.CAPTURE.REFUNDED", "REFUNDED"),
      );
      expect(await payments.findById(userId, row.id)).toMatchObject({
        status: "CAPTURED",
        paypalCaptureStatus: "PENDING",
      });
    });
  });
});
