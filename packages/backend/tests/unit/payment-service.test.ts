import { beforeEach, describe, expect, it } from "vitest";

import { PaymentError } from "../../src/domain/payment-errors";
import { PayPalApiError } from "../../src/integrations/paypal/paypal-client";
import {
  createPaymentService,
  type PaymentService,
} from "../../src/use-cases/payments";
import {
  createFakePayPal,
  createInMemoryAudit,
  createInMemoryDecisions,
  createInMemoryPayments,
} from "../support/in-memory";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const approvedDecisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const blockedDecisionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function expectPaymentError(code: string) {
  return expect.objectContaining({ name: "PaymentError", code });
}

describe("payment service", () => {
  let paypal: ReturnType<typeof createFakePayPal>;
  let payments: ReturnType<typeof createInMemoryPayments>;
  let audit: ReturnType<typeof createInMemoryAudit>;
  let service: PaymentService;

  beforeEach(() => {
    paypal = createFakePayPal();
    payments = createInMemoryPayments();
    audit = createInMemoryAudit();
    service = createPaymentService({
      paypal: paypal.client,
      payments,
      audit: audit.log,
      decisions: createInMemoryDecisions([
        {
          decisionId: approvedDecisionId,
          userId,
          outcome: "AUTO_APPROVE",
          reviewStatus: null,
          productName: "Desk lamp",
          amount: 49.5,
          currency: "USD",
        },
        {
          decisionId: blockedDecisionId,
          userId,
          outcome: "BLOCK",
          reviewStatus: null,
          productName: "Overpriced lamp",
          amount: 500,
          currency: "USD",
        },
      ]),
      returnUrl: "http://localhost:3000/api/v1/payments/return",
      cancelUrl: "http://localhost:3000/dashboard",
    });
  });

  const create = (idempotencyKey = "key-00000001") =>
    service.createPaymentOrder({
      userId,
      decisionId: approvedDecisionId,
      idempotencyKey,
    });

  async function authorized() {
    const payment = await create();
    paypal.buyerApproves(payment.paypalOrderId);
    return service.authorizePayment(userId, payment.id);
  }

  describe("createPaymentOrder", () => {
    it("creates a PayPal order in CREATED with the approval link", async () => {
      const payment = await create();

      expect(payment).toMatchObject({
        status: "CREATED",
        amount: 49.5,
        currency: "USD",
        paypalOrderStatus: "PAYER_ACTION_REQUIRED",
      });
      expect(payment.approveUrl).toContain(payment.paypalOrderId);
      expect(audit.types()).toEqual(["PAYMENT_CREATED"]);
    });

    it("returns the same payment when retried with the same key", async () => {
      const first = await create();
      const second = await create();

      expect(second.id).toBe(first.id);
      expect(payments.rows).toHaveLength(1);
      expect(paypal.calls.filter((c) => c === "createOrder")).toHaveLength(1);
      expect(audit.types()).toEqual(["PAYMENT_CREATED"]);
    });

    it("rejects reusing a key for a different decision", async () => {
      await create();
      await expect(
        service.createPaymentOrder({
          userId,
          decisionId: blockedDecisionId,
          idempotencyKey: "key-00000001",
        }),
      ).rejects.toEqual(expectPaymentError("IDEMPOTENCY_KEY_REUSED"));
    });

    it("refuses a second active payment for the same decision", async () => {
      await create("key-00000001");
      await expect(create("key-00000002")).rejects.toEqual(
        expectPaymentError("DECISION_ALREADY_PAID"),
      );
      expect(paypal.calls.filter((c) => c === "createOrder")).toHaveLength(1);
    });

    it("refuses to pay a BLOCK decision without calling PayPal", async () => {
      await expect(
        service.createPaymentOrder({
          userId,
          decisionId: blockedDecisionId,
          idempotencyKey: "key-00000001",
        }),
      ).rejects.toEqual(expectPaymentError("DECISION_NOT_PAYABLE"));
      expect(paypal.calls).toEqual([]);
    });

    it("allows MANUAL_REVIEW only after reviewer approval", async () => {
      const manualId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      const withReview = createPaymentService({
        paypal: paypal.client,
        payments,
        audit: audit.log,
        decisions: createInMemoryDecisions([
          {
            decisionId: manualId,
            userId,
            outcome: "MANUAL_REVIEW",
            reviewStatus: null,
            productName: "Fair lamp",
            amount: 55,
            currency: "USD",
          },
          {
            decisionId: approvedDecisionId,
            userId,
            outcome: "MANUAL_REVIEW",
            reviewStatus: "APPROVED",
            productName: "Fair lamp approved",
            amount: 55,
            currency: "USD",
          },
        ]),
        returnUrl: "http://localhost:3000/api/v1/payments/return",
        cancelUrl: "http://localhost:3000/dashboard",
      });

      await expect(
        withReview.createPaymentOrder({
          userId,
          decisionId: manualId,
          idempotencyKey: "key-manual-1",
        }),
      ).rejects.toEqual(expectPaymentError("DECISION_NOT_PAYABLE"));

      const payment = await withReview.createPaymentOrder({
        userId,
        decisionId: approvedDecisionId,
        idempotencyKey: "key-manual-2",
      });
      expect(payment.status).toBe("CREATED");
    });

    it("hides other users' decisions", async () => {
      await expect(
        service.createPaymentOrder({
          userId: otherUserId,
          decisionId: approvedDecisionId,
          idempotencyKey: "key-00000001",
        }),
      ).rejects.toEqual(expectPaymentError("DECISION_NOT_FOUND"));
    });

    it("maps PayPal outages to a retryable error and audits them", async () => {
      paypal.failNextCall(new PayPalApiError("timeout", 0, "TIMEOUT"));

      await expect(create()).rejects.toEqual(
        expectPaymentError("PAYPAL_UNAVAILABLE"),
      );
      expect(payments.rows).toHaveLength(0);
      expect(audit.events[0]).toMatchObject({
        type: "PAYPAL_CALL_FAILED",
        entityType: "decision",
        payload: { operation: "createOrder", issue: "TIMEOUT" },
      });
    });
  });

  describe("authorizePayment", () => {
    it("refuses to authorize before the buyer approves", async () => {
      const payment = await create();

      await expect(
        service.authorizePayment(userId, payment.id),
      ).rejects.toEqual(expectPaymentError("ORDER_NOT_APPROVED"));
      expect(payments.rows[0]!.status).toBe("CREATED");
      expect(paypal.calls).not.toContain("authorizeOrder");
    });

    it("moves CREATED -> APPROVED -> AUTHORIZED and stores PayPal ids", async () => {
      const payment = await authorized();

      expect(payment).toMatchObject({
        status: "AUTHORIZED",
        paypalOrderStatus: "COMPLETED",
        paypalAuthorizationId: `AUTH-${payment.paypalOrderId}`,
        paypalAuthorizationStatus: "CREATED",
      });
      expect(audit.types()).toEqual([
        "PAYMENT_CREATED",
        "PAYMENT_APPROVED",
        "PAYMENT_AUTHORIZED",
      ]);
    });

    it("is idempotent once authorized", async () => {
      const payment = await authorized();
      const again = await service.authorizePayment(userId, payment.id);

      expect(again.status).toBe("AUTHORIZED");
      expect(paypal.calls.filter((c) => c === "authorizeOrder")).toHaveLength(
        1,
      );
      expect(audit.types()).toHaveLength(3);
    });

    it("completes approval from PayPal's return redirect order id", async () => {
      const payment = await create();
      paypal.buyerApproves(payment.paypalOrderId);

      const result = await service.completeApproval(
        userId,
        payment.paypalOrderId,
      );
      expect(result.status).toBe("AUTHORIZED");
    });

    it("does not let another user authorize the payment", async () => {
      const payment = await create();
      paypal.buyerApproves(payment.paypalOrderId);

      await expect(
        service.authorizePayment(otherUserId, payment.id),
      ).rejects.toEqual(expectPaymentError("PAYMENT_NOT_FOUND"));
    });
  });

  describe("capture and void", () => {
    it("captures an authorized payment once", async () => {
      const payment = await authorized();
      const captured = await service.capturePayment(userId, payment.id);
      const again = await service.capturePayment(userId, payment.id);

      expect(captured).toMatchObject({
        status: "CAPTURED",
        paypalCaptureStatus: "COMPLETED",
        paypalAuthorizationStatus: "CAPTURED",
      });
      expect(again.status).toBe("CAPTURED");
      expect(
        paypal.calls.filter((c) => c === "captureAuthorization"),
      ).toHaveLength(1);
      expect(audit.types().at(-1)).toBe("PAYMENT_CAPTURED");
    });

    it("voids an authorized payment", async () => {
      const payment = await authorized();
      const voided = await service.voidPayment(userId, payment.id);

      expect(voided).toMatchObject({
        status: "VOIDED",
        paypalAuthorizationStatus: "VOIDED",
      });
      expect(audit.types().at(-1)).toBe("PAYMENT_VOIDED");
    });

    it("never voids a captured payment", async () => {
      const payment = await authorized();
      await service.capturePayment(userId, payment.id);

      const attempt = service.voidPayment(userId, payment.id);
      await expect(attempt).rejects.toBeInstanceOf(PaymentError);
      await expect(attempt).rejects.toMatchObject({
        code: "INVALID_TRANSITION",
        message: expect.stringContaining("refund"),
      });
      expect(paypal.calls).not.toContain("voidAuthorization");
    });

    it("refuses to capture a voided payment", async () => {
      const payment = await authorized();
      await service.voidPayment(userId, payment.id);

      await expect(service.capturePayment(userId, payment.id)).rejects.toEqual(
        expectPaymentError("INVALID_TRANSITION"),
      );
    });

    it("refuses to capture or void before authorization", async () => {
      const payment = await create();

      await expect(service.capturePayment(userId, payment.id)).rejects.toEqual(
        expectPaymentError("INVALID_TRANSITION"),
      );
      await expect(service.voidPayment(userId, payment.id)).rejects.toEqual(
        expectPaymentError("INVALID_TRANSITION"),
      );
    });

    it("keeps the payment AUTHORIZED when PayPal declines the capture", async () => {
      const payment = await authorized();
      paypal.failNextCall(
        new PayPalApiError("Declined", 422, "AUTHORIZATION_EXPIRED"),
      );

      await expect(service.capturePayment(userId, payment.id)).rejects.toEqual(
        expectPaymentError("PAYPAL_DECLINED"),
      );
      expect(payments.rows[0]!.status).toBe("AUTHORIZED");
    });
  });
});
