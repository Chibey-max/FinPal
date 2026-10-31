import type { DecisionRow, SpendingConstraints } from "@finpal/contracts";
import { capsOrderProblem, saveConstraintsSchema } from "@finpal/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPaymentService } from "../../src/use-cases/payments";
import {
  createFakePayPal,
  createInMemoryAudit,
  createInMemoryDecisions,
  createInMemoryPayments,
} from "../support/in-memory";
import { summarizeHistory } from "../../src/use-cases/agent-support";
import {
  applyBudget,
  createShoppingAgent,
  spreadAcrossPrices,
  splitList,
} from "../../src/use-cases/shopping-agent";

const userId = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BLOCKED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EUR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REVIEW = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const decision = (
  decisionId: string,
  amount: number,
  outcome: "AUTO_APPROVE" | "BLOCK" | "MANUAL_REVIEW" = "AUTO_APPROVE",
  currency = "USD",
) => ({
  decisionId,
  userId,
  outcome,
  reviewStatus: null,
  productName: `Item ${decisionId.slice(0, 1)}`,
  amount,
  currency,
});

const caps = (daily?: number, monthly?: number): SpendingConstraints => ({
  timezone: "UTC",
  currency: "USD",
  timeWindows: [],
  amountCaps: { perPurchase: 1000, daily, monthly },
});

const expectCode = (code: string) =>
  expect.objectContaining({ name: "PaymentError", code });

describe("basket checkout", () => {
  let paypal: ReturnType<typeof createFakePayPal>;
  let payments: ReturnType<typeof createInMemoryPayments>;
  let audit: ReturnType<typeof createInMemoryAudit>;

  const service = (constraints: SpendingConstraints | null = null) =>
    createPaymentService({
      paypal: paypal.client,
      payments,
      audit: audit.log,
      constraints: { get: async () => constraints },
      decisions: createInMemoryDecisions([
        decision(A, 100.1),
        decision(B, 200.2),
        decision(BLOCKED, 50, "BLOCK"),
        decision(REVIEW, 50, "MANUAL_REVIEW"),
        decision(EUR, 50, "AUTO_APPROVE", "EUR"),
      ]),
      returnUrl: "http://localhost/return",
      cancelUrl: "http://localhost/cancel",
    });
  const input = (decisionIds = [A, B], idempotencyKey = "basket-0001") => ({
    userId,
    decisionIds,
    idempotencyKey,
  });

  beforeEach(() => {
    paypal = createFakePayPal();
    payments = createInMemoryPayments();
    audit = createInMemoryAudit();
  });

  it("creates one PayPal order with one row per item and the exact total", async () => {
    const createOrder = vi.spyOn(paypal.client, "createOrder");
    const basket = await service().createBasketOrder(input());

    expect(createOrder).toHaveBeenCalledOnce();
    expect(createOrder.mock.calls[0]?.[0]).toMatchObject({
      amount: 300.3,
      items: [
        { name: "Item a", amount: 100.1 },
        { name: "Item b", amount: 200.2 },
      ],
    });
    expect(basket.total).toBe(300.3);
    expect(basket.status).toBe("CREATED");
    expect(basket.items.map((item) => item.amount)).toEqual([100.1, 200.2]);
    expect(new Set(basket.items.map((i) => i.paypalOrderId)).size).toBe(1);
    expect(new Set(basket.items.map((i) => i.basketId))).toEqual(
      new Set([basket.id]),
    );
  });

  it("replays the same key without a second order", async () => {
    const createOrder = vi.spyOn(paypal.client, "createOrder");
    const first = await service().createBasketOrder(input());
    const second = await service().createBasketOrder(input());
    expect(second.id).toBe(first.id);
    expect(createOrder).toHaveBeenCalledOnce();
  });

  it("rejects the key for a different set of items", async () => {
    await service().createBasketOrder(input());
    await expect(service().createBasketOrder(input([A]))).rejects.toEqual(
      expectCode("IDEMPOTENCY_KEY_REUSED"),
    );
  });

  it.each([
    [BLOCKED, "DECISION_NOT_PAYABLE"],
    [REVIEW, "DECISION_NOT_PAYABLE"],
    [EUR, "DECISION_NOT_PAYABLE"],
    ["99999999-9999-4999-8999-999999999999", "DECISION_NOT_FOUND"],
  ])("refuses the whole basket when an item is %s", async (bad, code) => {
    const createOrder = vi.spyOn(paypal.client, "createOrder");
    await expect(service().createBasketOrder(input([A, bad]))).rejects.toEqual(
      expectCode(code),
    );
    expect(createOrder).not.toHaveBeenCalled();
    expect(payments.rows).toHaveLength(0);
  });

  it("refuses items already being paid", async () => {
    await service().createBasketOrder(input([A]));
    await expect(
      service().createBasketOrder(input([A, B], "basket-0002")),
    ).rejects.toEqual(expectCode("DECISION_ALREADY_PAID"));
  });

  it("settles every item together once the buyer approves", async () => {
    const svc = service();
    const basket = await svc.createBasketOrder(input());
    await expect(svc.settleBasket(userId, basket.id)).rejects.toEqual(
      expectCode("ORDER_NOT_APPROVED"),
    );
    expect(payments.rows.every((r) => r.status === "CREATED")).toBe(true);

    paypal.buyerApproves(basket.paypalOrderId);
    const settled = await svc.settleBasket(userId, basket.id);
    expect(settled.status).toBe("CAPTURED");
    expect(settled.items.every((i) => i.status === "CAPTURED")).toBe(true);
    expect(new Set(settled.items.map((i) => i.paypalCaptureId)).size).toBe(1);
    // One audit trail per item, so each purchase shows its own history.
    const captured = audit.events.filter((e) => e.type === "PAYMENT_CAPTURED");
    expect(captured).toHaveLength(2);
  });

  it("settling twice captures once", async () => {
    const svc = service();
    const capture = vi.spyOn(paypal.client, "captureAuthorization");
    const basket = await svc.createBasketOrder(input());
    paypal.buyerApproves(basket.paypalOrderId);
    await svc.settleBasket(userId, basket.id);
    await svc.settleBasket(userId, basket.id);
    expect(capture).toHaveBeenCalledOnce();
  });

  it("the PayPal return settles the basket from its order id", async () => {
    const svc = service();
    const basket = await svc.createBasketOrder(input());
    paypal.buyerApproves(basket.paypalOrderId);
    const row = await svc.completeApproval(userId, basket.paypalOrderId);
    expect(row.status).toBe("CAPTURED");
    expect(payments.rows.every((r) => r.status === "CAPTURED")).toBe(true);
  });

  it("resumes from AUTHORIZED when capture failed the first time", async () => {
    const svc = service();
    const basket = await svc.createBasketOrder(input());
    paypal.buyerApproves(basket.paypalOrderId);
    const capture = vi
      .spyOn(paypal.client, "captureAuthorization")
      .mockRejectedValueOnce(
        Object.assign(new Error("down"), { name: "other" }),
      );
    await expect(svc.settleBasket(userId, basket.id)).rejects.toThrow();
    expect(payments.rows.every((r) => r.status === "AUTHORIZED")).toBe(true);

    const settled = await svc.settleBasket(userId, basket.id);
    expect(settled.status).toBe("CAPTURED");
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("voiding one item voids the whole basket", async () => {
    const svc = service();
    const basket = await svc.createBasketOrder(input());
    paypal.buyerApproves(basket.paypalOrderId);
    vi.spyOn(paypal.client, "captureAuthorization").mockRejectedValueOnce(
      new Error("down"),
    );
    await expect(svc.settleBasket(userId, basket.id)).rejects.toThrow();

    await svc.voidPayment(userId, basket.items[0]!.id);
    expect(payments.rows.every((r) => r.status === "VOIDED")).toBe(true);
  });

  describe("caps", () => {
    it("refuses a total over the daily cap though each item fits", async () => {
      const createOrder = vi.spyOn(paypal.client, "createOrder");
      await expect(
        service(caps(250)).createBasketOrder(input()),
      ).rejects.toEqual(expectCode("BASKET_OVER_CAP"));
      expect(createOrder).not.toHaveBeenCalled();
    });

    it("refuses a total over the monthly cap", async () => {
      await expect(
        service(caps(undefined, 250)).createBasketOrder(input()),
      ).rejects.toEqual(expectCode("BASKET_OVER_CAP"));
    });

    it("allows a total exactly at the cap", async () => {
      await expect(
        service(caps(300.3)).createBasketOrder(input()),
      ).resolves.toMatchObject({ total: 300.3 });
    });

    it("rechecks before charging if spend changed after the order", async () => {
      const basket = await service(caps(500)).createBasketOrder(input());
      paypal.buyerApproves(basket.paypalOrderId);
      const authorize = vi.spyOn(paypal.client, "authorizeOrder");
      await expect(
        service(caps(100)).settleBasket(userId, basket.id),
      ).rejects.toEqual(expectCode("BASKET_OVER_CAP"));
      expect(authorize).not.toHaveBeenCalled();
    });
  });
});

describe("cap order", () => {
  it.each([
    [{ perPurchase: 500, daily: 100 }, "perPurchase"],
    [{ perPurchase: 50, daily: 900, monthly: 500 }, "daily"],
    [{ perPurchase: 900, monthly: 500 }, "perPurchase"],
  ])("rejects %j", (value, field) => {
    expect(capsOrderProblem(value)?.field).toBe(field);
  });

  it.each([
    [{ perPurchase: 100, daily: 100, monthly: 100 }],
    [{ perPurchase: 100 }],
    [{ perPurchase: 100, daily: 200 }],
  ])("accepts %j", (value) => {
    expect(capsOrderProblem(value)).toBeNull();
  });

  it("flags the field on save", () => {
    const result = saveConstraintsSchema.safeParse({
      timezone: "UTC",
      currency: "USD",
      timeWindows: [],
      amountCaps: { perPurchase: 500, daily: 100 },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      "amountCaps",
      "perPurchase",
    ]);
  });
});

describe("shopping list", () => {
  it("splits a list and asks about vague items", () => {
    expect(
      splitList("headphones under $200, clothes and a travel adapter"),
    ).toEqual([
      { need: "headphones under $200", question: null },
      { need: "clothes", question: "What kind of clothes do you need?" },
      { need: "a travel adapter", question: null },
    ]);
  });

  it("keeps the price range in view, not just the cheapest", () => {
    const offers = Array.from({ length: 30 }, (_, i) => i);
    const spread = spreadAcrossPrices(offers, 8);
    expect(spread).toHaveLength(8);
    expect(spread[0]).toBe(0);
    expect(spread[7]).toBe(29);
    expect(spread).toEqual([...spread].sort((a, b) => a - b));
    expect(spreadAcrossPrices([1, 2], 8)).toEqual([1, 2]);
  });

  it("holds back approved items that don't fit together", () => {
    const run = (price: number, outcome = "AUTO_APPROVE") =>
      ({ pick: { price }, decision: { outcome }, hold: null }) as never;
    const held = applyBudget(
      [run(100), run(300), run(50), run(900, "BLOCK")],
      { dailyLeft: 200, monthlyLeft: null },
      "USD",
    );
    expect(held.map((r) => r.hold !== null)).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });

  it("asks instead of searching, and shops the rest", async () => {
    const lookup = vi.fn(async ({ query }: { query: string }) => ({
      query,
      currency: "USD",
      status: "OK",
      offers: [
        {
          productId: "p",
          title: "Travel adapter",
          merchant: "shop.com",
          price: 20,
          currency: "USD",
          url: "https://shop.com/p",
        },
      ],
      excluded: {},
      fetchedAt: "",
      providerError: null,
    }));
    const createProposal = vi.fn(async (_u: string, i: object) => ({
      id: "p1",
      ...i,
    }));
    const agent = createShoppingAgent({
      offers: { lookup },
      evaluation: {
        createProposal,
        evaluateProposal: async () => ({
          evaluation: { id: "e" },
          decision: { id: "d", outcome: "AUTO_APPROVE" },
        }),
      },
      audit: { record: async () => {} },
    } as never);
    const runs = await agent.runList(userId, {
      list: "clothes and a travel adapter",
      currency: "usd",
    });
    expect(runs.map((r) => r.status)).toEqual(["NEEDS_DETAIL", "PROPOSED"]);
    expect(runs[0]?.question).toContain("clothes");
    expect(lookup).toHaveBeenCalledOnce();
    expect(createProposal).toHaveBeenCalledOnce();
  });

  it("summarises history without ids", () => {
    const row = (over: Partial<DecisionRow>) =>
      ({
        decisionId: "secret-id",
        productName: "Lamp",
        amount: 40,
        decidedAt: "2026-10-20T10:00:00.000Z",
        outcome: "AUTO_APPROVE",
        reviewStatus: null,
        paymentStatus: null,
        ...over,
      }) as DecisionRow;
    const history = summarizeHistory([
      row({ paymentStatus: "CAPTURED", amount: 30 }),
      row({ paymentStatus: "CAPTURED", amount: 50 }),
      row({ outcome: "MANUAL_REVIEW", reviewStatus: "REJECTED", amount: 400 }),
      row({ outcome: "BLOCK", amount: 900 }),
      row({}),
    ]);
    expect(history.bought).toHaveLength(2);
    expect(history.rejected[0]?.price).toBe(400);
    expect(JSON.stringify(history)).not.toContain("900");
    expect(history.typicalPrice).toBe(50);
    expect(JSON.stringify(history)).not.toContain("secret-id");
  });
});
