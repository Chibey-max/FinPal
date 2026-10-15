import type { SpendingConstraints } from "@finpal/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { createChannel3HttpClient } from "../../src/integrations/channel3/channel3-http-client";
import { createPayPalHttpClient } from "../../src/integrations/paypal/paypal-http-client";
import { createQualityScoreService } from "../../src/services/quality-score-service";
import { createComparableOffersService } from "../../src/use-cases/comparable-offers";
import { createEvaluationService } from "../../src/use-cases/evaluate-proposal";
import { createPaymentService } from "../../src/use-cases/payments";
import { createInMemoryDb } from "../support/in-memory-db";
import {
  createChannel3Simulator,
  createPayPalSandboxSimulator,
} from "../support/simulated-services";

// End-to-end slice: proposal -> evaluation -> decision -> PayPal
// authorization -> capture/void -> audit, wired exactly like the web app's
// composition root, with only the network and database simulated.

const userId = "11111111-1111-4111-8111-111111111111";

// Comparable offers per product (median in brackets).
const catalog = {
  "Desk lamp": [45, 50, 55], // [50]
  Monitor: [140, 150, 160], // [150]
  Keyboard: [75, 80, 85], // [80]
  "Rare vinyl": [30, 32], // too few offers
  "Flaky item": "timeout",
} as const;

const limits: SpendingConstraints = {
  timezone: "Africa/Lagos",
  currency: "USD",
  timeWindows: [
    { days: ["MON", "TUE", "WED", "THU", "FRI"], start: "09:00", end: "18:00" },
  ],
  amountCaps: { perPurchase: 100, daily: 120 },
};

function createTestApp() {
  // Wednesday 21 Oct 2026, 12:00 in Lagos.
  const clock = () => new Date("2026-10-21T11:00:00Z");
  const db = createInMemoryDb(clock);
  const paypal = createPayPalSandboxSimulator();
  const channel3 = createChannel3Simulator({ ...catalog });

  const evaluations = createEvaluationService({
    proposals: db.proposals,
    constraints: db.constraints,
    payments: db.payments,
    quality: createQualityScoreService({
      offers: createComparableOffersService({
        channel3: createChannel3HttpClient({
          apiKey: "channel3-test-key",
          fetch: channel3.fetch,
        }),
        now: clock,
      }),
    }),
    evaluations: db.evaluations,
    audit: db.audit.log,
    now: clock,
  });

  const payments = createPaymentService({
    paypal: createPayPalHttpClient({
      clientId: "sandbox-client",
      clientSecret: "sandbox-secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetch: paypal.fetch,
    }),
    payments: db.payments,
    decisions: db.decisions,
    audit: db.audit.log,
    returnUrl: "http://localhost:3000/api/v1/payments/return",
    cancelUrl: "http://localhost:3000/dashboard?payment=cancelled",
  });

  return { db, paypal, channel3, evaluations, payments };
}

describe("end-to-end slice", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    app = createTestApp();
    await app.db.constraints.save(userId, limits);
  });

  async function propose(productName: string, proposedPrice: number) {
    const proposal = await app.evaluations.createProposal(userId, {
      productName,
      proposedPrice,
      currency: "USD",
      source: "MANUAL",
    });
    return app.evaluations.evaluateProposal(userId, proposal.id);
  }

  async function payAndAuthorize(decisionId: string, key: string) {
    const payment = await app.payments.createPaymentOrder({
      userId,
      decisionId,
      idempotencyKey: key,
    });
    // The buyer opens approveUrl, approves, and PayPal redirects back.
    app.paypal.buyerApproves(payment.paypalOrderId);
    return app.payments.completeApproval(userId, payment.paypalOrderId);
  }

  it("happy path: good price -> AUTO_APPROVE -> authorize -> capture, fully audited", async () => {
    const { decision, evaluation } = await propose("Desk lamp", 50);

    expect(decision.outcome).toBe("AUTO_APPROVE");
    expect(evaluation.quality).toMatchObject({
      score: "GOOD",
      medianPrice: 50,
      lowestPrice: 45,
      offerCount: 3,
    });

    const created = await app.payments.createPaymentOrder({
      userId,
      decisionId: decision.id,
      idempotencyKey: "lamp-checkout-1",
    });
    expect(created.status).toBe("CREATED");
    expect(created.approveUrl).toBe(
      `https://www.sandbox.paypal.com/checkoutnow?token=${created.paypalOrderId}`,
    );
    // The exact amount reached PayPal, formatted the way PayPal expects.
    expect(app.paypal.orders.get(created.paypalOrderId)).toMatchObject({
      amount: "50.00",
      currency: "USD",
    });

    app.paypal.buyerApproves(created.paypalOrderId);
    const authorized = await app.payments.completeApproval(
      userId,
      created.paypalOrderId,
    );
    expect(authorized).toMatchObject({
      status: "AUTHORIZED",
      paypalOrderStatus: "COMPLETED",
      paypalAuthorizationStatus: "CREATED",
    });

    const captured = await app.payments.capturePayment(userId, created.id);
    expect(captured).toMatchObject({
      status: "CAPTURED",
      paypalCaptureStatus: "COMPLETED",
    });

    expect(app.db.audit.types()).toEqual([
      "PROPOSAL_CREATED",
      "EVALUATION_COMPLETED",
      "DECISION_RECORDED",
      "PAYMENT_CREATED",
      "PAYMENT_APPROVED",
      "PAYMENT_AUTHORIZED",
      "PAYMENT_CAPTURED",
    ]);
    const activity = await app.db.audit.log.listActivity(userId);
    expect(activity.events[0]!.type).toBe("PAYMENT_CAPTURED");
    expect(activity.events).toHaveLength(7);
  });

  it("void path: an authorized payment is voided and can no longer be captured", async () => {
    const { decision } = await propose("Desk lamp", 50);
    const authorized = await payAndAuthorize(decision.id, "lamp-void-1");

    const voided = await app.payments.voidPayment(userId, authorized.id);
    expect(voided).toMatchObject({
      status: "VOIDED",
      paypalAuthorizationStatus: "VOIDED", // from PayPal's 204 No Content
    });

    const callsBefore = app.paypal.calls.length;
    await expect(
      app.payments.capturePayment(userId, authorized.id),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(app.paypal.calls.length).toBe(callsBefore); // PayPal never asked
    expect(app.db.audit.types().at(-1)).toBe("PAYMENT_VOIDED");
  });

  it("over cap: a fairly priced item above the per-purchase cap is blocked", async () => {
    const { decision, evaluation } = await propose("Monitor", 150);

    expect(evaluation.quality.score).toBe("GOOD");
    expect(decision.outcome).toBe("BLOCK");
    // 150 exceeds both the 100 per-purchase cap and the 120 daily cap.
    expect(decision.reasons.map((r) => [r.code, r.message])).toEqual([
      ["OVER_AMOUNT_CAP", "$150.00 is over your per-purchase cap of $100.00."],
      [
        "OVER_AMOUNT_CAP",
        "This would take today's spending over your daily cap of $120.00.",
      ],
    ]);
    await expect(
      app.payments.createPaymentOrder({
        userId,
        decisionId: decision.id,
        idempotencyKey: "monitor-1",
      }),
    ).rejects.toMatchObject({ code: "DECISION_NOT_PAYABLE" });
    expect(app.paypal.calls).toEqual([]);
  });

  it("poor price: more than 20% above the median is blocked", async () => {
    const { decision, evaluation } = await propose("Desk lamp", 60.01);

    expect(evaluation.quality.score).toBe("POOR");
    expect(decision.outcome).toBe("BLOCK");
    expect(decision.reasons.map((r) => r.code)).toEqual(["POOR_QUALITY"]);
    expect(app.paypal.calls).toEqual([]);
  });

  it("insufficient data: too few comparable offers goes to manual review", async () => {
    const { decision, evaluation } = await propose("Rare vinyl", 31);

    expect(evaluation.quality).toMatchObject({
      score: "INSUFFICIENT_DATA",
      offerStatus: "INSUFFICIENT_OFFERS",
      offerCount: 2,
    });
    expect(decision.outcome).toBe("MANUAL_REVIEW");
    await expect(
      app.payments.createPaymentOrder({
        userId,
        decisionId: decision.id,
        idempotencyKey: "vinyl-1",
      }),
    ).rejects.toMatchObject({ code: "DECISION_NOT_PAYABLE" });
  });

  it("Channel3 timeout: the price check degrades to manual review", async () => {
    const { decision, evaluation } = await propose("Flaky item", 20);

    expect(evaluation.quality.offerStatus).toBe("UNAVAILABLE");
    expect(decision.outcome).toBe("MANUAL_REVIEW");
    // One retry, then give up.
    expect(app.channel3.queries).toEqual(["Flaky item", "Flaky item"]);
  });

  it("daily cap: an authorized purchase counts towards the next one the same day", async () => {
    const first = await propose("Desk lamp", 50);
    await payAndAuthorize(first.decision.id, "lamp-daily-1");

    // 50 already authorized today + 80 = 130 > 120 daily cap.
    const second = await propose("Keyboard", 80);
    expect(second.evaluation.quality.score).toBe("GOOD");
    expect(second.decision.outcome).toBe("BLOCK");
    expect(second.decision.reasons[0]!.message).toContain("daily cap");
  });

  it("buyer has not approved yet: authorization is refused without charging", async () => {
    const { decision } = await propose("Desk lamp", 50);
    const created = await app.payments.createPaymentOrder({
      userId,
      decisionId: decision.id,
      idempotencyKey: "lamp-early-1",
    });

    await expect(
      app.payments.completeApproval(userId, created.paypalOrderId),
    ).rejects.toMatchObject({ code: "ORDER_NOT_APPROVED" });
    expect(app.paypal.calls).not.toContain(
      `POST /v2/checkout/orders/${created.paypalOrderId}/authorize`,
    );
  });

  it("PayPal outage: creating the order fails safely and a retry with the same key succeeds once", async () => {
    const { decision } = await propose("Desk lamp", 50);
    app.paypal.failNext(1);

    await expect(
      app.payments.createPaymentOrder({
        userId,
        decisionId: decision.id,
        idempotencyKey: "lamp-retry-1",
      }),
    ).rejects.toMatchObject({ code: "PAYPAL_UNAVAILABLE" });
    expect(app.db.audit.events.at(-1)).toMatchObject({
      type: "PAYPAL_CALL_FAILED",
      payload: {
        operation: "createOrder",
        httpStatus: 503,
        debugId: "dbg-outage",
      },
    });

    const retried = await app.payments.createPaymentOrder({
      userId,
      decisionId: decision.id,
      idempotencyKey: "lamp-retry-1",
    });
    const again = await app.payments.createPaymentOrder({
      userId,
      decisionId: decision.id,
      idempotencyKey: "lamp-retry-1",
    });
    expect(again.id).toBe(retried.id);
    expect(app.paypal.orders.size).toBe(1);
    expect(app.db.payments.rows).toHaveLength(1);
  });
});
