import type { SpendingConstraints } from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import {
  PayPalApiError,
  type CreatePayPalPayoutInput,
  type PayPalClient,
  type PayPalPayout,
} from "../../src/integrations/paypal/paypal-client";
import { createMemoryPaypalConnectionRepository } from "../../src/repositories/memory-paypal-connection-repository";
import { createMemorySendDraftRepository } from "../../src/repositories/memory-send-draft-repository";
import {
  createMemoryUserWalletRepository,
  seedMemoryWallet,
} from "../../src/repositories/memory-user-wallet-repository";
import { withSends } from "../../src/services/committed-spend";
import {
  createSendFundsService,
  isBalanceQuestion,
  mapPayoutStatus,
  parseSendMessage,
  sendBatchId,
  type SendLimits,
} from "../../src/use-cases/send-funds";
import { createInMemoryAudit } from "../support/in-memory";

const USER = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const KEY = "send_key_first_approval";

/**
 * PayPal Payouts as documented: PayPal-Request-Id replays the first result,
 * and a sender_batch_id used before is refused with a link to the original.
 */
function createPayPal(balance = 1000) {
  const byBatchId = new Map<string, PayPalPayout>();
  const byRequestId = new Map<string, PayPalPayout>();
  const calls: CreatePayPalPayoutInput[] = [];
  let itemStatus: string | null = "SUCCESS";
  let itemError: string | null = null;
  let batchStatus = "SUCCESS";
  let loseNextResponse = false;
  let failNext: PayPalApiError | null = null;

  const client = {
    async getBalances() {
      // PayPal refreshed the balance three hours ago.
      return {
        available: balance,
        currency: "USD",
        asOf: "2026-11-05T09:00:00Z",
      };
    },
    async createPayout(input: CreatePayPalPayoutInput) {
      calls.push(input);
      if (failNext) {
        const error = failNext;
        failNext = null;
        throw error;
      }
      const replay = byRequestId.get(input.requestId);
      if (replay) return replay;
      const existing = byBatchId.get(input.senderBatchId);
      if (existing) {
        throw new PayPalApiError(
          "Batch with given sender_batch_id already exists.",
          400,
          "USER_BUSINESS_ERROR",
          "debug-1",
          [
            `https://api-m.sandbox.paypal.com/v1/payments/payouts/${existing.batchId}`,
          ],
        );
      }
      const n = byBatchId.size + 1;
      const payout: PayPalPayout = {
        batchId: `BATCH-${n}`,
        batchStatus,
        payoutItemId: itemStatus ? `ITEM-${n}` : null,
        transactionStatus: itemStatus,
      };
      byBatchId.set(input.senderBatchId, payout);
      byRequestId.set(input.requestId, payout);
      if (loseNextResponse) {
        // PayPal paid, but the answer never arrived.
        loseNextResponse = false;
        throw new PayPalApiError("PayPal is unreachable.", 0, "NETWORK");
      }
      return payout;
    },
    async getPayoutBatch(batchId: string) {
      const found = [...byBatchId.values()].find((p) => p.batchId === batchId);
      if (!found) throw new PayPalApiError("Not found.", 404, "NOT_FOUND");
      return {
        ...found,
        batchStatus,
        transactionStatus: itemStatus,
        errorMessage: itemError,
      };
    },
    async getPayoutItem(payoutItemId: string) {
      return {
        payoutItemId,
        transactionStatus: itemStatus ?? "PENDING",
        payoutBatchId: null,
        errorMessage: itemError,
      };
    },
  };

  return {
    client: client as unknown as PayPalClient,
    calls,
    payouts: () => byBatchId.size,
    /** Another request already used this batch id at PayPal. */
    alreadyPaid(input: CreatePayPalPayoutInput) {
      return client.createPayout(input);
    },
    loseNextResponse: () => {
      loseNextResponse = true;
    },
    failNext: (error: PayPalApiError) => {
      failNext = error;
    },
    setItemStatus: (status: string | null) => {
      itemStatus = status;
    },
    setBatchStatus: (status: string) => {
      batchStatus = status;
    },
    setItemError: (message: string | null) => {
      itemError = message;
    },
  };
}

const caps = (daily?: number): SpendingConstraints => ({
  timezone: "UTC",
  currency: "USD",
  timeWindows: [],
  amountCaps: { perPurchase: 1000, daily },
});

async function connectAndFund(
  connections: ReturnType<typeof createMemoryPaypalConnectionRepository>,
  wallets: ReturnType<typeof createMemoryUserWalletRepository>,
  userId: string,
  balance = 1000,
) {
  await connections.save(userId, {
    refreshTokenEncrypted: `enc-${userId}`,
    payerId: `PAYER-${userId.slice(-4)}`,
    email: `${userId.slice(-4)}@sandbox.test`,
  });
  await seedMemoryWallet(wallets, userId, balance);
}

async function setup(
  options: {
    constraints?: SpendingConstraints | null;
    limits?: Partial<SendLimits>;
    balance?: number;
  } = {},
) {
  const sends = createMemorySendDraftRepository();
  const audit = createInMemoryAudit();
  const paypal = createPayPal();
  const connections = createMemoryPaypalConnectionRepository();
  const wallets = createMemoryUserWalletRepository();
  const purchases = { total: 0 };
  let constraints = options.constraints ?? null;
  const clock = { now: new Date("2026-11-05T12:00:00Z") };
  const spend = withSends({ sumCommitted: async () => purchases.total }, sends);
  const service = createSendFundsService({
    paypal: paypal.client,
    constraints: { get: async () => constraints },
    spend,
    sends,
    audit: audit.log,
    connections,
    wallets,
    limits: options.limits,
    now: () => clock.now,
  });
  const balance = options.balance ?? 1000;
  await connectAndFund(connections, wallets, USER, balance);
  await connectAndFund(connections, wallets, OTHER, balance);
  const draft = (message = "Send $40 to mom@example.com for her birthday") =>
    service.createDraft(USER, { message });
  return {
    service,
    sends,
    audit,
    paypal,
    connections,
    wallets,
    purchases,
    spend,
    clock,
    draft,
    setConstraints: (next: SpendingConstraints | null) => {
      constraints = next;
    },
  };
}

const sendCode = (code: string) =>
  expect.objectContaining({ name: "SendError", code });

describe("parseSendMessage", () => {
  it("parses amount, email, and memo", () => {
    expect(parseSendMessage("Send $40 to mom@email.com for birthday")).toEqual({
      amount: 40,
      currency: "USD",
      recipientEmail: "mom@email.com",
      memo: "birthday",
    });
  });

  it("accepts pay / transfer verbs", () => {
    expect(parseSendMessage("pay 12.5 to friend@x.co")).toMatchObject({
      amount: 12.5,
      recipientEmail: "friend@x.co",
    });
    expect(parseSendMessage("Transfer 20 USD to: a@b.co")).toMatchObject({
      amount: 20,
    });
  });

  it("rejects shopping lists, even ones that mention pay or an email", () => {
    expect(parseSendMessage("headphones under $200")).toBeNull();
    expect(
      parseSendMessage(
        "A $30 phone case, pay later is fine, receipt to me@example.com",
      ),
    ).toBeNull();
    expect(
      parseSendMessage("Headphones and a gift card for sam@example.com"),
    ).toBeNull();
  });

  it("needs one recipient after 'to'", () => {
    expect(parseSendMessage("Send $40 mom@example.com")).toBeNull();
    expect(
      parseSendMessage("Send $5 to a@example.com and b@example.com"),
    ).toBeNull();
  });
});

describe("isBalanceQuestion", () => {
  it("matches common balance prompts", () => {
    expect(isBalanceQuestion("What's my balance?")).toBe(true);
    expect(isBalanceQuestion("balance")).toBe(true);
    expect(isBalanceQuestion("Send $10 to a@b.com")).toBe(false);
  });
});

describe("mapPayoutStatus", () => {
  it("treats money that came back as returned, not pending", () => {
    expect(mapPayoutStatus("REVERSED")).toBe("RETURNED");
    expect(mapPayoutStatus("REFUNDED")).toBe("RETURNED");
    expect(mapPayoutStatus("RETURNED")).toBe("RETURNED");
    expect(mapPayoutStatus("BLOCKED")).toBe("FAILED");
    expect(mapPayoutStatus("ONHOLD")).toBe("PENDING");
  });
});

describe("approve", () => {
  it("pays once, with one batch id per draft", async () => {
    const t = await setup();
    const draft = await t.draft();
    const sent = await t.service.approve(USER, draft.id, KEY);
    expect(sent).toMatchObject({ status: "SENT", payoutStatus: "SUCCESS" });
    expect(t.paypal.calls).toEqual([
      expect.objectContaining({
        requestId: KEY,
        senderBatchId: sendBatchId(draft.id),
      }),
    ]);
    expect(t.audit.types()).toEqual([
      "SEND_DRAFT_CREATED",
      "SEND_APPROVED",
      "SEND_SENT",
    ]);
  });

  it("finishes a payout whose answer was lost, without paying twice", async () => {
    const t = await setup();
    const draft = await t.draft();
    t.paypal.loseNextResponse();
    await expect(t.service.approve(USER, draft.id, KEY)).rejects.toEqual(
      sendCode("PAYPAL_UNAVAILABLE"),
    );
    // The key was stored before PayPal was called.
    expect(await t.sends.get(USER, draft.id)).toMatchObject({
      status: "PAYING",
      idempotencyKey: KEY,
    });
    // Refresh never declares it failed: PayPal may have paid it.
    expect(await t.service.refresh(USER, draft.id)).toMatchObject({
      status: "PAYING",
    });

    const finished = await t.service.approve(USER, draft.id, KEY);
    expect(finished).toMatchObject({
      status: "SENT",
      payoutBatchId: "BATCH-1",
    });
    expect(t.paypal.payouts()).toBe(1);
    expect(t.paypal.calls.map((call) => call.requestId)).toEqual([KEY, KEY]);
  });

  it("lets only one of two simultaneous approvals pay", async () => {
    const t = await setup();
    const draft = await t.draft();
    const results = await Promise.all([
      t.service.approve(USER, draft.id, "send_key_tab_one"),
      t.service.approve(USER, draft.id, "send_key_tab_two"),
    ]);
    expect(t.paypal.calls).toHaveLength(1);
    expect(t.paypal.payouts()).toBe(1);
    expect(results.map((r) => r.status).sort()).toEqual(["PAYING", "SENT"]);
    expect(t.audit.types().filter((type) => type === "SEND_APPROVED")).toEqual([
      "SEND_APPROVED",
    ]);
  });

  it("follows PayPal's original payout when the batch already exists", async () => {
    const t = await setup();
    const draft = await t.draft();
    // An earlier attempt reached PayPal under another request id.
    await t.paypal.alreadyPaid({
      amount: 40,
      currency: "USD",
      recipientEmail: "mom@example.com",
      requestId: "lost-request",
      senderBatchId: sendBatchId(draft.id),
    });
    const sent = await t.service.approve(USER, draft.id, KEY);
    expect(sent).toMatchObject({ status: "SENT", payoutBatchId: "BATCH-1" });
    expect(t.paypal.payouts()).toBe(1);
  });

  it("checks the rules again at approval", async () => {
    const t = await setup({ constraints: caps(100) });
    const draft = await t.draft("Send $80 to mom@example.com");
    expect(draft.ruleOutcome).toBe("MANUAL_REVIEW");
    // A purchase since the draft leaves only $50 of today's cap.
    t.purchases.total = 50;
    await expect(t.service.approve(USER, draft.id, KEY)).rejects.toEqual(
      sendCode("SEND_NOT_APPROVABLE"),
    );
    expect(await t.service.getDraft(USER, draft.id)).toMatchObject({
      status: "FAILED",
      ruleOutcome: "BLOCK",
    });
    expect(t.paypal.calls).toEqual([]);
  });

  it("marks a send failed when PayPal refuses it outright", async () => {
    const t = await setup();
    const draft = await t.draft();
    t.paypal.failNext(
      new PayPalApiError("Not enough money.", 422, "INSUFFICIENT_FUNDS"),
    );
    await expect(t.service.approve(USER, draft.id, KEY)).rejects.toEqual(
      sendCode("INSUFFICIENT_BALANCE"),
    );
    expect(await t.service.getDraft(USER, draft.id)).toMatchObject({
      status: "FAILED",
      payoutStatus: "FAILED",
    });
  });

  it("fails a denied batch that has no items", async () => {
    const t = await setup();
    t.paypal.setItemStatus(null);
    t.paypal.setBatchStatus("DENIED");
    const draft = await t.draft();
    expect(await t.service.approve(USER, draft.id, KEY)).toMatchObject({
      status: "FAILED",
      payoutStatus: "FAILED",
    });
  });

  it("keeps PayPal's reason when a payout fails after it was sent", async () => {
    const t = await setup();
    t.paypal.setItemStatus("PENDING");
    const draft = await t.draft();
    expect(await t.service.approve(USER, draft.id, KEY)).toMatchObject({
      status: "SENT",
      payoutStatus: "PENDING",
    });
    // PayPal later refuses the item, as with a Sandbox account in a country
    // that can't receive payments.
    t.paypal.setItemStatus("FAILED");
    t.paypal.setItemError(
      "As the recipient's country can't receive payments, this transaction is not allowed.",
    );
    const failed = await t.service.refresh(USER, draft.id);
    expect(failed).toMatchObject({ status: "FAILED", payoutStatus: "FAILED" });
    expect(failed.ruleReason).toMatch(/recipient's country can't receive/);
    // Checking again changes nothing and records the failure only once.
    await t.service.refresh(USER, draft.id);
    expect(t.audit.types().filter((type) => type === "SEND_FAILED")).toEqual([
      "SEND_FAILED",
    ]);
  });

  it("does not count a reversed payout as spent", async () => {
    const t = await setup();
    t.paypal.setItemStatus("REVERSED");
    const draft = await t.draft();
    expect(await t.service.approve(USER, draft.id, KEY)).toMatchObject({
      status: "FAILED",
      payoutStatus: "RETURNED",
    });
    const day = [
      new Date("2026-11-05T00:00:00Z"),
      new Date("2026-11-06T00:00:00Z"),
    ] as const;
    expect(await t.sends.sumCommitted(USER, "USD", ...day)).toBe(0);
  });
});

describe("limits and caps", () => {
  const day = [
    new Date("2026-11-05T00:00:00Z"),
    new Date("2026-11-06T00:00:00Z"),
  ] as const;

  it("counts sends against the caps purchases use, and the other way round", async () => {
    const t = await setup();
    const draft = await t.draft();
    await t.service.approve(USER, draft.id, KEY);
    t.purchases.total = 10;
    expect(await t.spend.sumCommitted(USER, "USD", ...day)).toBe(50);
  });

  it("uses the default limits when a setting is unset", async () => {
    // Unset environment settings arrive as undefined.
    const t = await setup({
      limits: { perUserDaily: undefined, totalDaily: undefined },
    });
    const wallet = await t.service.getWallet(USER);
    expect(wallet).toMatchObject({ sendableToday: 250, dailyLimit: 250 });
    const over = await t.draft("Send $300 to dad@example.com");
    expect(over.ruleOutcome).toBe("BLOCK");
  });

  it("includes the user's own caps in what they can send today", async () => {
    const t = await setup({ constraints: caps(100) });
    t.purchases.total = 30;
    expect((await t.service.getWallet(USER)).sendableToday).toBe(70);
  });

  it("limits what one person can send per day", async () => {
    const t = await setup({ limits: { perUserDaily: 50 } });
    const first = await t.draft("Send $40 to mom@example.com");
    await t.service.approve(USER, first.id, KEY);
    const second = await t.draft("Send $20 to dad@example.com");
    expect(second.ruleOutcome).toBe("BLOCK");
    expect(second.ruleReason).toMatch(/per person a day/);
  });

  it("limits what everyone together can send", async () => {
    const t = await setup({ limits: { totalDaily: 100 } });
    
    const theirs = await t.service.createDraft(OTHER, {
      message: "Send $90 to friend@example.com",
    });
    await t.service.approve(OTHER, theirs.id, "send_key_other_user");
    const mine = await t.draft("Send $20 to mom@example.com");
    expect(mine.ruleOutcome).toBe("BLOCK");
    expect(mine.ruleReason).toMatch(/daily send total for all users/);
  });

  it("debits the personal FinPal ledger on a successful send", async () => {
    const t = await setup();
    const draft = await t.draft();
    await t.service.approve(USER, draft.id, KEY);
    const wallet = await t.service.getWallet(USER);
    expect(wallet.available).toBe(960);
    expect(wallet.connected).toBe(true);
    expect(wallet.balanceStatus).toBe("LIVE");
    expect(wallet.sendableToday).toBe(210);
  });

  it("blocks send when PayPal is not connected", async () => {
    const t = await setup();
    
    await t.connections.remove(USER);
    await expect(t.service.createDraft(USER, { message: "Send $10 to a@b.co" })).rejects.toEqual(
      sendCode("PAYPAL_NOT_CONNECTED"),
    );
  });

  it("counts a send on the day it left, however late it is refreshed", async () => {
    const t = await setup();
    t.paypal.setItemStatus("PENDING");
    const draft = await t.draft();
    await t.service.approve(USER, draft.id, KEY);
    t.clock.now = new Date("2026-11-06T09:00:00Z");
    t.paypal.setItemStatus("SUCCESS");
    expect(await t.service.refresh(USER, draft.id)).toMatchObject({
      payoutStatus: "SUCCESS",
    });
    expect(await t.sends.sumCommitted(USER, "USD", ...day)).toBe(40);
    expect(
      await t.sends.sumCommitted(
        USER,
        "USD",
        new Date("2026-11-06T00:00:00Z"),
        new Date("2026-11-07T00:00:00Z"),
      ),
    ).toBe(0);
  });
});
