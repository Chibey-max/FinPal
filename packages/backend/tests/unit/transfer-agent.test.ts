import {
  createProposalRequestSchema,
  transferRequestSchema,
  type SpendingConstraints,
} from "@finpal/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { decideTransfer } from "../../src/domain/decision-table";
import { summarizeHistory } from "../../src/use-cases/agent-support";
import { createPayPalHttpClient } from "../../src/integrations/paypal/paypal-http-client";
import { createPaymentService } from "../../src/use-cases/payments";
import {
  createTransferAgent,
  parseTransferText,
} from "../../src/use-cases/transfer-agent";
import {
  createFakePayPal,
  createInMemoryAudit,
  createInMemoryDecisions,
  createInMemoryPayments,
} from "../support/in-memory";

const userId = "11111111-1111-4111-8111-111111111111";
const TRANSFER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const email = "celestineleste@gmail.com";

describe("parseTransferText", () => {
  it.each([
    ["send $100 to celestineleste@gmail.com", 100, "USD"],
    ["Send 100 dollars to celestineleste@gmail.com.", 100, "USD"],
    ["pay celestineleste@gmail.com 100 euros", 100, "EUR"],
    ["send £1,250.50 to celestineleste@gmail.com", 1250.5, "GBP"],
    ["send 100 to celestineleste@gmail.com", 100, "NGN"],
  ])("reads %s", (text, amount, currency) => {
    expect(parseTransferText(text, "NGN")).toEqual({
      amount,
      currency,
      recipientEmail: email,
      question: null,
    });
  });

  it.each([
    "send $100 to celestine leste at gmail dot com",
    "send $100 to celestine leste at gmail.com",
    "send $100 to celestine leste@gmail.com",
  ])("rejoins an address speech recognition split: %s", (text) => {
    expect(parseTransferText(text, "USD").recipientEmail).toBe(email);
  });

  it("does not take digits in the address as the amount", () => {
    expect(
      parseTransferText("send to user42@example.com", "USD"),
    ).toMatchObject({ amount: null, recipientEmail: "user42@example.com" });
  });

  it("asks for whatever is missing rather than guessing", () => {
    expect(parseTransferText("send $100", "USD").question).toMatch(/email/);
    expect(parseTransferText(`send to ${email}`, "USD").question).toMatch(
      /How much/,
    );
    expect(parseTransferText("send money", "USD").amount).toBeNull();
  });
});

describe("the model only fills gaps", () => {
  const agentReplying = (reply: unknown) =>
    createTransferAgent({
      llm: { complete: vi.fn(async () => JSON.stringify(reply)) },
      evaluation: { createProposal: vi.fn(), evaluateProposal: vi.fn() },
      audit: { record: vi.fn() },
    });

  it("accepts a number word the rules can't read", async () => {
    const draft = await agentReplying({
      amount: 100,
      currency: "USD",
      recipientEmail: email,
    }).parse(`send a hundred dollars to ${email}`, "USD");
    expect(draft).toMatchObject({ amount: 100, question: null });
  });

  it("rejects an address the user never said", async () => {
    const draft = await agentReplying({
      amount: 100,
      currency: "USD",
      recipientEmail: "attacker@example.com",
    }).parse("send a hundred dollars to my friend", "USD");
    expect(draft.recipientEmail).toBeNull();
    expect(draft.question).toMatch(/email/);
  });

  it("does not consult the model when the rules understood everything", async () => {
    const complete = vi.fn(async () => "{}");
    const agent = createTransferAgent({
      llm: { complete },
      evaluation: { createProposal: vi.fn(), evaluateProposal: vi.fn() },
      audit: { record: vi.fn() },
    });
    await agent.parse(`send $100 to ${email}`, "USD");
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("submit", () => {
  it("creates an AGENT proposal with the recipient and audits the words heard", async () => {
    const createProposal = vi.fn(async () => ({ id: "proposal-1" }) as never);
    const evaluateProposal = vi.fn(async () => ({}) as never);
    const record = vi.fn(async () => undefined as never);
    const agent = createTransferAgent({
      evaluation: { createProposal, evaluateProposal },
      audit: { record },
    });
    await agent.submit(userId, {
      text: `send $100 to ${email}`,
      amount: 100,
      currency: "USD",
      recipientEmail: email,
    });
    expect(createProposal).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ source: "AGENT", recipientEmail: email }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "AGENT_TRANSFER_REQUESTED",
        payload: expect.objectContaining({ heard: `send $100 to ${email}` }),
      }),
    );
    expect(evaluateProposal).toHaveBeenCalledWith(userId, "proposal-1");
  });
});

describe("contracts", () => {
  it("never lets the public proposals API set a recipient", () => {
    const parsed = createProposalRequestSchema.parse({
      productName: "Lamp",
      proposedPrice: 10,
      currency: "USD",
      source: "MANUAL",
      recipientEmail: email,
    });
    expect(parsed).not.toHaveProperty("recipientEmail");
  });

  it("validates a confirmed transfer", () => {
    const valid = {
      text: "send",
      amount: 19.99,
      currency: "usd",
      recipientEmail: "Celestine@Gmail.com",
    };
    expect(
      transferRequestSchema.parse({ ...valid, text: "send it" }),
    ).toMatchObject({ currency: "USD", recipientEmail: "celestine@gmail.com" });
    for (const bad of [
      { amount: 0 },
      { amount: 1.234 },
      { amount: 2_000_000 },
      { recipientEmail: "not-an-email" },
    ]) {
      expect(
        transferRequestSchema.safeParse({ ...valid, text: "send it", ...bad })
          .success,
      ).toBe(false);
    }
  });
});

describe("shopping history", () => {
  it("leaves transfers out of what the agent thinks you buy", () => {
    const row = (
      productName: string,
      amount: number,
      recipientEmail?: string,
    ) =>
      ({
        productName,
        amount,
        recipientEmail,
        paymentStatus: "CAPTURED",
        reviewStatus: null,
        decidedAt: "2026-11-04T10:00:00Z",
      }) as never;
    const history = summarizeHistory([
      row("Lamp", 20),
      row(`Transfer to ${email}`, 5000, email),
    ]);
    expect(history.bought.map((b) => b.title)).toEqual(["Lamp"]);
    expect(history.typicalPrice).toBe(20);
  });
});

describe("decideTransfer", () => {
  const passing = {
    constraints: "PASS",
    amount: "UNDER_CAP",
    reasons: [],
  } as never;

  it("approves within the rules", () => {
    expect(decideTransfer(passing).outcome).toBe("AUTO_APPROVE");
  });

  it("blocks over a cap or outside the rules", () => {
    expect(
      decideTransfer({
        constraints: "PASS",
        amount: "OVER_CAP",
        reasons: [
          {
            code: "OVER_PER_PURCHASE_CAP",
            message: "Over your per-purchase cap.",
          },
        ],
      } as never).outcome,
    ).toBe("BLOCK");
    expect(
      decideTransfer({
        constraints: "FAIL",
        amount: "UNDER_CAP",
        reasons: [
          { code: "OUTSIDE_TIME_WINDOW", message: "Outside your hours." },
        ],
      } as never).outcome,
    ).toBe("BLOCK");
  });

  it("sends it to a person when no rules are set", () => {
    expect(decideTransfer(null)).toMatchObject({
      outcome: "MANUAL_REVIEW",
      reasons: [expect.objectContaining({ code: "NO_CONSTRAINTS" })],
    });
  });
});

describe("paying a transfer", () => {
  let paypal: ReturnType<typeof createFakePayPal>;
  let payments: ReturnType<typeof createInMemoryPayments>;
  let audit: ReturnType<typeof createInMemoryAudit>;
  const caps = (daily: number): SpendingConstraints => ({
    timezone: "UTC",
    currency: "USD",
    timeWindows: [],
    amountCaps: { perPurchase: 1000, daily },
  });
  const service = (constraints: SpendingConstraints | null = null) =>
    createPaymentService({
      paypal: paypal.client,
      payments,
      audit: audit.log,
      constraints: { get: async () => constraints },
      decisions: createInMemoryDecisions([
        {
          decisionId: TRANSFER,
          userId,
          outcome: "AUTO_APPROVE",
          reviewStatus: null,
          productName: `Transfer to ${email}`,
          amount: 100,
          currency: "USD",
          recipientEmail: email,
        },
        {
          decisionId: ITEM,
          userId,
          outcome: "AUTO_APPROVE",
          reviewStatus: null,
          productName: "Lamp",
          amount: 20,
          currency: "USD",
        },
      ]),
      returnUrl: "http://localhost/return",
      cancelUrl: "http://localhost/cancel",
    });

  beforeEach(() => {
    paypal = createFakePayPal();
    payments = createInMemoryPayments();
    audit = createInMemoryAudit();
  });

  it("creates the order for the recipient and captures it without authorizing", async () => {
    const createOrder = vi.spyOn(paypal.client, "createOrder");
    const svc = service();
    const basket = await svc.createBasketOrder({
      userId,
      decisionIds: [TRANSFER],
      idempotencyKey: "transfer-key",
    });
    expect(createOrder.mock.calls[0]![0]).toMatchObject({ payeeEmail: email });
    expect(basket.items[0]).toMatchObject({ payeeEmail: email });

    paypal.buyerApproves(basket.paypalOrderId);
    const paid = await svc.settleBasket(userId, basket.id);
    expect(paid.status).toBe("CAPTURED");
    expect(paid.items[0]).toMatchObject({
      paypalAuthorizationId: null,
      paypalCaptureStatus: "PENDING",
    });
    expect(paypal.calls).toContain("captureOrder");
    expect(paypal.calls).not.toContain("authorizeOrder");
    expect(audit.events.map((e) => e.type)).toContain("PAYMENT_CAPTURED");
  });

  it("will not capture before PayPal approval", async () => {
    const svc = service();
    const basket = await svc.createBasketOrder({
      userId,
      decisionIds: [TRANSFER],
      idempotencyKey: "transfer-key",
    });
    await expect(svc.settleBasket(userId, basket.id)).rejects.toMatchObject({
      code: "ORDER_NOT_APPROVED",
    });
  });

  it("is settled by a retried capture without paying twice", async () => {
    const svc = service();
    const basket = await svc.createBasketOrder({
      userId,
      decisionIds: [TRANSFER],
      idempotencyKey: "transfer-key",
    });
    paypal.buyerApproves(basket.paypalOrderId);
    await svc.settleBasket(userId, basket.id);
    await svc.settleBasket(userId, basket.id);
    expect(paypal.calls.filter((c) => c === "captureOrder")).toHaveLength(1);
  });

  it("counts toward the caps once paid", async () => {
    const svc = service(caps(150));
    const basket = await svc.createBasketOrder({
      userId,
      decisionIds: [TRANSFER],
      idempotencyKey: "transfer-key",
    });
    paypal.buyerApproves(basket.paypalOrderId);
    await svc.settleBasket(userId, basket.id);
    const start = new Date(Date.now() - 86_400_000);
    const end = new Date(Date.now() + 86_400_000);
    expect(await payments.sumCommitted(userId, "USD", start, end)).toBe(100);
  });

  it("refuses a transfer over what is left of the daily cap", async () => {
    await expect(
      service(caps(50)).createBasketOrder({
        userId,
        decisionIds: [TRANSFER],
        idempotencyKey: "transfer-key",
      }),
    ).rejects.toMatchObject({ code: "BASKET_OVER_CAP" });
    expect(paypal.calls).not.toContain("createOrder");
  });

  it("never shares a basket with purchases", async () => {
    await expect(
      service().createBasketOrder({
        userId,
        decisionIds: [ITEM, TRANSFER],
        idempotencyKey: "mixed-key",
      }),
    ).rejects.toMatchObject({ code: "DECISION_NOT_PAYABLE" });
  });

  it("routes the single-payment path to the recipient too", async () => {
    const createOrder = vi.spyOn(paypal.client, "createOrder");
    const payment = await service().createPaymentOrder({
      userId,
      decisionId: TRANSFER,
      idempotencyKey: "single-key",
    });
    expect(createOrder.mock.calls[0]![0]).toMatchObject({ payeeEmail: email });
    expect(payment.payeeEmail).toBe(email);
    expect(payment.basketId).not.toBeNull();
  });
});

describe("PayPal requests for a transfer", () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const setup = (body: unknown) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ access_token: "t", expires_in: 3600 }))
      .mockResolvedValueOnce(json(body));
    const client = createPayPalHttpClient({
      clientId: "id",
      clientSecret: "secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetch: fetchMock,
    });
    return { client, fetchMock };
  };

  it("asks for an immediate capture paid to the recipient", async () => {
    const { client, fetchMock } = setup({
      id: "ORDER-1",
      status: "PAYER_ACTION_REQUIRED",
    });
    await client.createOrder({
      amount: 100,
      currency: "USD",
      description: "Transfer",
      payeeEmail: email,
      requestId: "order-1",
      returnUrl: "https://app/return",
      cancelUrl: "https://app/cancel",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body));
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0].payee).toEqual({ email_address: email });
  });

  it("keeps purchases on authorize, paying the merchant", async () => {
    const { client, fetchMock } = setup({
      id: "ORDER-1",
      status: "PAYER_ACTION_REQUIRED",
    });
    await client.createOrder({
      amount: 100,
      currency: "USD",
      description: "Lamp",
      requestId: "order-1",
      returnUrl: "https://app/return",
      cancelUrl: "https://app/cancel",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body));
    expect(body.intent).toBe("AUTHORIZE");
    expect(body.purchase_units[0].payee).toBeUndefined();
  });

  it("reads PayPal's capture response, including a pending one", async () => {
    const { client, fetchMock } = setup({
      status: "COMPLETED",
      purchase_units: [
        { payments: { captures: [{ id: "CAP-1", status: "PENDING" }] } },
      ],
    });
    await expect(client.captureOrder("ORDER-1", "capture-1")).resolves.toEqual({
      orderStatus: "COMPLETED",
      captureId: "CAP-1",
      captureStatus: "PENDING",
    });
    expect(String(fetchMock.mock.calls[1]![0])).toContain(
      "/v2/checkout/orders/ORDER-1/capture",
    );
  });
});
