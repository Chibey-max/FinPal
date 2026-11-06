import { randomUUID } from "node:crypto";

import type {
  AuditEventType,
  CreateSendDraftInput,
  PayoutStatus,
  SendDraft,
  SendDraftStatus,
  SendRuleOutcome,
  SpendingConstraints,
  WalletSummary,
} from "@finpal/contracts";

import { checkConstraints } from "../domain/constraints";
import { SendError } from "../domain/send-errors";
import { localDayRange, localMonthRange } from "../domain/zoned-time";
import {
  PayPalApiError,
  type PayPalClient,
  type PayPalPayout,
} from "../integrations/paypal/paypal-client";
import type {
  SendDraftRepository,
  StoredSendDraft,
} from "../repositories/send-draft-repository";
import type { AuditLog } from "../services/audit-log";
import type { CommittedSpend } from "../services/committed-spend";
import { formatMoney } from "./agent-support";

/**
 * Every FinPal user sends from one shared PayPal Sandbox business account,
 * so FinPal limits sends itself: per person, and for everyone together.
 */
export interface SendLimits {
  /** Most one person may send per day, in their timezone. */
  perUserDaily: number;
  /** Most all users together may send per UTC day. */
  totalDaily: number;
}

export const DEFAULT_SEND_LIMITS: SendLimits = {
  perUserDaily: 250,
  totalDaily: 1000,
};

export interface SendFundsServiceDeps {
  paypal: PayPalClient;
  constraints: { get(userId: string): Promise<SpendingConstraints | null> };
  /** Purchases plus sends (see withSends), counted against the user's caps. */
  spend: CommittedSpend;
  sends: SendDraftRepository;
  audit: Pick<AuditLog, "record">;
  limits?: Partial<SendLimits>;
  /** Short public label for the Sandbox merchant wallet. */
  accountLabel?: string;
  now?: () => Date;
}

export type SendFundsService = ReturnType<typeof createSendFundsService>;

const EMAIL_SOURCE =
  "[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+";
const EMAIL = new RegExp(EMAIL_SOURCE);
const EMAILS = new RegExp(EMAIL_SOURCE, "g");
const SEND_VERB = /^(?:please\s+)?(?:send|pay|transfer|payout)\b/i;

/**
 * Parses "Send $40 to mom@email.com for her birthday". Only a message that
 * starts by asking to send, names one recipient after "to", and has an
 * amount before it counts: a shopping list that mentions "pay" or an email
 * address is not a send.
 */
export function parseSendMessage(message: string): {
  amount: number;
  currency: string;
  recipientEmail: string;
  memo: string | null;
} | null {
  const trimmed = message.trim();
  const verb = trimmed.match(SEND_VERB);
  if (!verb) return null;
  // One recipient per send.
  if ((trimmed.match(EMAILS) ?? []).length !== 1) return null;
  const emailMatch = trimmed.match(EMAIL)!;
  const recipientEmail = emailMatch[0];

  const between = trimmed.slice(verb[0].length, emailMatch.index);
  if (!/\bto\s*:?\s*$/i.test(between)) return null;
  const amountMatch =
    between.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/) ??
    between.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:usd|dollars?|bucks)?\b/i);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1]!.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const after = trimmed.slice((emailMatch.index ?? 0) + recipientEmail.length);
  const memoMatch = after.match(/^\s*(?:for|memo|note|re:?|-|:)\s+(.+)$/i);
  const memo = memoMatch?.[1]?.trim().slice(0, 200) || null;

  return { amount, currency: "USD", recipientEmail, memo };
}

export function isBalanceQuestion(message: string) {
  return /^(what'?s?\s+(my\s+)?balance|balance(\?)?|how much (do i |have i got |have )?(i\s+)?(got|have|left)|wallet)\b/i.test(
    message.trim(),
  );
}

/** PayPal's item statuses, reduced to what FinPal tracks. */
export function mapPayoutStatus(raw: string | null | undefined): PayoutStatus {
  switch ((raw ?? "").toUpperCase()) {
    case "":
      return "NONE";
    case "SUCCESS":
      return "SUCCESS";
    case "UNCLAIMED":
      return "UNCLAIMED";
    // The money went back to the wallet.
    case "RETURNED":
    case "REVERSED":
    case "REFUNDED":
      return "RETURNED";
    case "FAILED":
    case "BLOCKED":
    case "DENIED":
      return "FAILED";
    // PENDING, ONHOLD and anything new: still in flight, so it keeps
    // counting against limits until PayPal settles it.
    default:
      return "PENDING";
  }
}

/** An item's status, or the batch's when PayPal lists no item yet. */
function payoutOutcome(payout: PayPalPayout): PayoutStatus {
  if (payout.transactionStatus) {
    return mapPayoutStatus(payout.transactionStatus);
  }
  const batch = payout.batchStatus.toUpperCase();
  return batch === "DENIED" || batch === "CANCELED" ? "FAILED" : "PENDING";
}

const statusFor = (payout: PayoutStatus): SendDraftStatus =>
  payout === "FAILED" || payout === "RETURNED" ? "FAILED" : "SENT";

/** One batch id per send, so PayPal can never pay the same draft twice. */
export const sendBatchId = (draftId: string) => `finpal-send-${draftId}`;

/** The original payout's batch id, from PayPal's duplicate-batch error. */
function originalBatchId(error: PayPalApiError): string | null {
  for (const href of error.links) {
    const match = href.match(/\/v1\/payments\/payouts\/([^/?#]+)/);
    if (match) return decodeURIComponent(match[1]!);
  }
  return null;
}

// Bundlers can load this package twice; match on the name as well.
function asPayPalError(error: unknown): PayPalApiError | null {
  if (error instanceof PayPalApiError) return error;
  return error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "PayPalApiError"
    ? (error as PayPalApiError)
    : null;
}

const cents = (amount: number) => Math.round(amount * 100);
const DAY_MS = 86_400_000;

function publicDraft(row: StoredSendDraft): SendDraft {
  return {
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    recipientEmail: row.recipientEmail,
    memo: row.memo,
    ruleOutcome: row.ruleOutcome,
    ruleReason: row.ruleReason,
    availableAtDraft: row.availableAtDraft,
    balanceAfterSend: row.balanceAfterSend,
    status: row.status,
    payoutBatchId: row.payoutBatchId,
    payoutItemId: row.payoutItemId,
    payoutStatus: row.payoutStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createSendFundsService(deps: SendFundsServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const accountLabel = deps.accountLabel ?? "PayPal Sandbox";
  // An unset setting arrives as undefined; it must not replace a default.
  const limits: SendLimits = {
    perUserDaily: deps.limits?.perUserDaily ?? DEFAULT_SEND_LIMITS.perUserDaily,
    totalDaily: deps.limits?.totalDaily ?? DEFAULT_SEND_LIMITS.totalDaily,
  };

  async function record(
    draft: Pick<StoredSendDraft, "id" | "userId">,
    type: AuditEventType,
    payload: Record<string, unknown>,
  ) {
    await deps.audit
      .record({
        userId: draft.userId,
        entityType: "send",
        entityId: draft.id,
        type,
        payload,
      })
      .catch((error) => {
        console.error("send audit record failed", type, error);
      });
  }

  async function recordCallFailed(
    draft: Pick<StoredSendDraft, "id" | "userId">,
    operation: string,
    error: PayPalApiError,
  ) {
    await record(draft, "PAYPAL_CALL_FAILED", {
      operation,
      httpStatus: error.status,
      issue: error.issue ?? null,
      debugId: error.debugId ?? null,
    });
  }

  /** A status lookup; PayPal errors become SendErrors. */
  async function lookUp<T>(
    operation: string,
    draft: Pick<StoredSendDraft, "id" | "userId">,
    call: () => Promise<T>,
  ): Promise<T> {
    try {
      return await call();
    } catch (error) {
      const paypalError = asPayPalError(error);
      if (!paypalError) throw error;
      await recordCallFailed(draft, operation, paypalError);
      if (paypalError.status === 401 || paypalError.status === 403) {
        throw new SendError(
          "PAYPAL_AUTH_FAILED",
          "PayPal rejected the Sandbox credentials.",
          { issue: paypalError.issue, debugId: paypalError.debugId },
        );
      }
      throw new SendError(
        "PAYPAL_UNAVAILABLE",
        "PayPal didn't answer. Try again in a moment.",
        { issue: paypalError.issue, debugId: paypalError.debugId },
      );
    }
  }

  /** The shared wallet's balance as PayPal reports it, possibly hours old. */
  async function readBalance() {
    try {
      const balances = await deps.paypal.getBalances();
      return {
        available: balances.available as number | null,
        currency: balances.currency,
        asOf: balances.asOf,
      };
    } catch (error) {
      const paypalError = asPayPalError(error);
      if (
        paypalError &&
        (paypalError.status === 403 ||
          paypalError.issue === "NOT_AUTHORIZED" ||
          paypalError.issue === "PERMISSION_DENIED")
      ) {
        // The app lacks Reporting permission; Payouts still work.
        return { available: null, currency: "USD", asOf: now().toISOString() };
      }
      throw error;
    }
  }

  /** What's left of FinPal's own send limits today. */
  async function limitsLeft(
    userId: string,
    currency: string,
    at: Date,
    timezone: string,
  ) {
    const mine = localDayRange(at, timezone);
    const everyone = localDayRange(at, "UTC");
    const [sentByMe, sentByAll] = await Promise.all([
      deps.sends.sumCommitted(userId, currency, mine.start, mine.end),
      deps.sends.sumCommitted(null, currency, everyone.start, everyone.end),
    ]);
    return {
      perUser: Math.max(0, cents(limits.perUserDaily) - cents(sentByMe)) / 100,
      total: Math.max(0, cents(limits.totalDaily) - cents(sentByAll)) / 100,
    };
  }

  /**
   * What's left of the user's own daily and monthly caps, purchases plus
   * sends. Infinity with no caps; 0 when the rules are in another currency,
   * since every send would then be blocked.
   */
  async function capsLeft(
    userId: string,
    currency: string,
    at: Date,
    constraints: SpendingConstraints | null,
  ) {
    if (!constraints) return Number.POSITIVE_INFINITY;
    if (constraints.currency !== currency) return 0;
    const { daily, monthly } = constraints.amountCaps;
    let left = Number.POSITIVE_INFINITY;
    for (const [cap, range] of [
      [daily, localDayRange(at, constraints.timezone)],
      [monthly, localMonthRange(at, constraints.timezone)],
    ] as const) {
      if (cap === undefined) continue;
      const spent = await deps.spend.sumCommitted(
        userId,
        currency,
        range.start,
        range.end,
      );
      left = Math.min(left, Math.max(0, cents(cap) - cents(spent)) / 100);
    }
    return left;
  }

  async function getWallet(userId: string): Promise<WalletSummary> {
    const balance = await readBalance();
    const at = now();
    const constraints = await deps.constraints.get(userId);
    let available: number | null = null;
    if (balance.available !== null) {
      // PayPal's balance can be up to 3 hours old: take off what has been
      // sent from the wallet since PayPal last refreshed it.
      const refreshed = new Date(balance.asOf);
      const since = Number.isNaN(refreshed.getTime()) ? at : refreshed;
      const sentSince = await deps.sends.sumCommitted(
        null,
        balance.currency,
        since,
        new Date(at.getTime() + DAY_MS),
      );
      available =
        Math.max(0, cents(balance.available) - cents(sentSince)) / 100;
    }
    const [left, rulesLeft] = await Promise.all([
      limitsLeft(userId, balance.currency, at, constraints?.timezone ?? "UTC"),
      capsLeft(userId, balance.currency, at, constraints),
    ]);
    return {
      available,
      currency: balance.currency,
      asOf: balance.asOf,
      accountLabel,
      balanceStatus: balance.available === null ? "UNAVAILABLE" : "LIVE",
      // Everything that could stop a send today, except allowed hours.
      sendableToday: Math.min(
        left.perUser,
        left.total,
        rulesLeft,
        available ?? Number.POSITIVE_INFINITY,
      ),
      dailyLimit: limits.perUserDaily,
    };
  }

  async function evaluateRules(
    userId: string,
    amount: number,
    currency: string,
    wallet: WalletSummary,
  ): Promise<{
    ruleOutcome: SendRuleOutcome;
    ruleReason: string;
    balanceAfterSend: number | null;
  }> {
    const money = (value: number) => formatMoney(value, currency);
    const block = (ruleReason: string) => ({
      ruleOutcome: "BLOCK" as const,
      ruleReason,
      balanceAfterSend: null,
    });
    const at = now();
    const constraints = await deps.constraints.get(userId);

    const left = await limitsLeft(
      userId,
      currency,
      at,
      constraints?.timezone ?? "UTC",
    );
    if (cents(amount) > cents(left.perUser)) {
      return block(
        `Everyone sends from one shared Sandbox wallet, so FinPal allows ${money(limits.perUserDaily)} of sends per person a day. You have ${money(left.perUser)} left today.`,
      );
    }
    if (cents(amount) > cents(left.total)) {
      return block(
        `The shared Sandbox wallet has reached FinPal's daily total for all users (${money(limits.totalDaily)}); ${money(left.total)} is left today. Try again tomorrow.`,
      );
    }
    if (wallet.available !== null && cents(amount) > cents(wallet.available)) {
      return block(
        `Not enough in the Sandbox wallet: about ${money(wallet.available)} is available. PayPal's balance can be up to 3 hours old, so this is an estimate.`,
      );
    }

    const balanceAfterSend =
      wallet.available === null
        ? null
        : (cents(wallet.available) - cents(amount)) / 100;
    const balanceNote =
      wallet.available === null
        ? " PayPal's balance isn't available to this app, so PayPal checks the funds when it pays."
        : "";

    if (!constraints) {
      return {
        ruleOutcome: "MANUAL_REVIEW",
        ruleReason: `No spending rules saved yet. Approve to send from the Sandbox wallet.${balanceNote}`,
        balanceAfterSend,
      };
    }

    // Purchases and sends share the caps (deps.spend counts both).
    const day = localDayRange(at, constraints.timezone);
    const month = localMonthRange(at, constraints.timezone);
    const [spentToday, spentThisMonth] = await Promise.all([
      constraints.amountCaps.daily === undefined
        ? 0
        : deps.spend.sumCommitted(
            userId,
            constraints.currency,
            day.start,
            day.end,
          ),
      constraints.amountCaps.monthly === undefined
        ? 0
        : deps.spend.sumCommitted(
            userId,
            constraints.currency,
            month.start,
            month.end,
          ),
    ]);
    const check = checkConstraints({
      constraints,
      amount,
      currency,
      at,
      spentToday,
      spentThisMonth,
    });
    if (check.constraints === "FAIL" || check.amount === "OVER_CAP") {
      return block(
        check.reasons[0]?.message ??
          "Your spending rules do not allow this send.",
      );
    }

    return {
      ruleOutcome: "MANUAL_REVIEW",
      ruleReason:
        wallet.available === null
          ? `Within your rules. Approve to pay with PayPal Payouts.${balanceNote}`
          : "Within your rules and the Sandbox balance. Approve to pay with PayPal Payouts.",
      balanceAfterSend,
    };
  }

  async function createDraft(
    userId: string,
    input: CreateSendDraftInput,
  ): Promise<SendDraft> {
    let amount = input.amount;
    let currency = (input.currency ?? "USD").toUpperCase();
    let recipientEmail = input.recipientEmail;
    let memo = input.memo ?? null;

    if (input.message) {
      const parsed = parseSendMessage(input.message);
      if (!parsed) {
        throw new SendError(
          "SEND_PARSE_FAILED",
          'Could not read a send. Try: "Send $40 to name@email.com for her birthday".',
        );
      }
      amount = parsed.amount;
      currency = parsed.currency;
      recipientEmail = parsed.recipientEmail;
      memo = memo ?? parsed.memo;
    }

    if (amount === undefined || !recipientEmail) {
      throw new SendError(
        "SEND_PARSE_FAILED",
        "Amount and recipient email are required.",
      );
    }
    amount = cents(amount) / 100;
    if (amount <= 0) {
      throw new SendError("SEND_PARSE_FAILED", "Enter an amount above zero.");
    }

    const wallet = await getWallet(userId);
    if (currency !== wallet.currency.toUpperCase()) {
      throw new SendError(
        "SEND_PARSE_FAILED",
        `Sends must be in ${wallet.currency}, the Sandbox wallet's currency.`,
      );
    }

    const rules = await evaluateRules(userId, amount, currency, wallet);
    const stamp = now().toISOString();
    const row: StoredSendDraft = {
      id: randomUUID(),
      userId,
      amount,
      currency,
      recipientEmail,
      memo,
      ruleOutcome: rules.ruleOutcome,
      ruleReason: rules.ruleReason,
      availableAtDraft: wallet.available,
      balanceAfterSend: rules.balanceAfterSend,
      status: "DRAFT",
      payoutBatchId: null,
      payoutItemId: null,
      payoutStatus: "NONE",
      createdAt: stamp,
      updatedAt: stamp,
      idempotencyKey: null,
      sentAt: null,
    };
    await deps.sends.save(row);

    await record(row, "SEND_DRAFT_CREATED", {
      amount: row.amount,
      currency: row.currency,
      recipientEmail: row.recipientEmail,
      memo: row.memo,
      ruleOutcome: row.ruleOutcome,
      ruleReason: row.ruleReason,
      availableAtDraft: row.availableAtDraft,
    });

    return publicDraft(row);
  }

  async function getDraft(userId: string, draftId: string): Promise<SendDraft> {
    const row = await deps.sends.get(userId, draftId);
    if (!row) throw new SendError("SEND_NOT_FOUND", "Send draft not found.");
    return publicDraft(row);
  }

  /**
   * Saves a send's PayPal outcome and records it once. A failed payout keeps
   * PayPal's reason (e.g. the recipient's country can't receive payments).
   */
  async function settle(
    before: StoredSendDraft,
    next: StoredSendDraft,
    paypalReason: string | null = null,
  ): Promise<StoredSendDraft> {
    const status = statusFor(next.payoutStatus);
    const settled: StoredSendDraft = {
      ...next,
      status,
      ruleReason:
        status === "FAILED" && paypalReason
          ? `PayPal couldn't complete this send: ${paypalReason}`
          : next.ruleReason,
      updatedAt: now().toISOString(),
    };
    await deps.sends.save(settled);
    if (settled.status !== before.status) {
      const facts = {
        amount: settled.amount,
        currency: settled.currency,
        recipientEmail: settled.recipientEmail,
        payoutBatchId: settled.payoutBatchId,
        payoutItemId: settled.payoutItemId,
        payoutStatus: settled.payoutStatus,
      };
      if (settled.status === "SENT") {
        await record(settled, "SEND_SENT", { ...facts, memo: settled.memo });
      } else {
        await record(settled, "SEND_FAILED", facts);
      }
    }
    return settled;
  }

  /**
   * Fills in the item and its status from the batch, with PayPal's reason
   * if it failed; keeps going on error.
   */
  async function readBatch(
    row: StoredSendDraft,
  ): Promise<[StoredSendDraft, string | null]> {
    try {
      const batch = await deps.paypal.getPayoutBatch(row.payoutBatchId!);
      return [
        {
          ...row,
          payoutItemId: batch.payoutItemId ?? row.payoutItemId,
          payoutStatus: payoutOutcome(batch),
        },
        batch.errorMessage ?? null,
      ];
    } catch (error) {
      const paypalError = asPayPalError(error);
      if (!paypalError) throw error;
      await recordCallFailed(row, "getPayoutBatch", paypalError);
      // PayPal accepted the batch; Refresh status will catch up.
      return [{ ...row, payoutStatus: "PENDING" }, null];
    }
  }

  /**
   * Pays a PAYING send. Every attempt for a draft uses its stored key as
   * PayPal-Request-Id and the same sender_batch_id, so a retry after a crash
   * or an outage gets PayPal's first result instead of a second payout.
   */
  async function pay(row: StoredSendDraft): Promise<StoredSendDraft> {
    if (row.payoutBatchId) return settle(row, ...(await readBatch(row)));

    let payout: PayPalPayout;
    try {
      payout = await deps.paypal.createPayout({
        amount: row.amount,
        currency: row.currency,
        recipientEmail: row.recipientEmail,
        memo: row.memo,
        requestId: row.idempotencyKey ?? sendBatchId(row.id),
        senderBatchId: sendBatchId(row.id),
      });
    } catch (error) {
      const paypalError = asPayPalError(error);
      if (!paypalError) throw error;
      const original = originalBatchId(paypalError);
      if (!original) return failToPay(row, paypalError);
      // PayPal already has this send's batch: follow it, don't fail it.
      payout = {
        batchId: original,
        batchStatus: "PENDING",
        payoutItemId: null,
        transactionStatus: null,
      };
    }

    let next: StoredSendDraft = {
      ...row,
      payoutBatchId: payout.batchId,
      payoutItemId: payout.payoutItemId,
      payoutStatus: payoutOutcome(payout),
    };
    let reason = payout.errorMessage ?? null;
    // One immediate look for the item; Refresh status does the rest.
    if (!next.payoutItemId) [next, reason] = await readBatch(next);
    return settle(row, next, reason);
  }

  async function failToPay(
    row: StoredSendDraft,
    error: PayPalApiError,
  ): Promise<never> {
    await recordCallFailed(row, "createPayout", error);
    const details = { issue: error.issue, debugId: error.debugId };

    // No answer, or one that might mean "already paid": keep the send
    // PAYING. Finish sending retries with the same ids, so it pays once.
    if (
      error.status === 0 ||
      error.status >= 500 ||
      error.status === 409 ||
      error.issue === "USER_BUSINESS_ERROR"
    ) {
      throw new SendError(
        "PAYPAL_UNAVAILABLE",
        "PayPal didn't confirm this send. It's saved: choose Finish sending in a moment. PayPal pays a send at most once.",
        details,
      );
    }

    // PayPal refused it outright, so nothing was paid.
    const failed: StoredSendDraft = {
      ...row,
      status: "FAILED",
      payoutStatus: "FAILED",
      ruleReason: `PayPal declined this send: ${error.message}`,
      updatedAt: now().toISOString(),
    };
    await deps.sends.save(failed);
    await record(failed, "SEND_FAILED", {
      reason: error.issue ?? "PAYPAL_DECLINED",
      httpStatus: error.status,
    });
    if (error.issue === "INSUFFICIENT_FUNDS") {
      throw new SendError(
        "INSUFFICIENT_BALANCE",
        "PayPal says the Sandbox wallet doesn't have enough money for this send. Nothing was sent.",
        details,
      );
    }
    if (error.status === 401 || error.status === 403) {
      throw new SendError(
        "PAYPAL_AUTH_FAILED",
        "PayPal rejected the Sandbox credentials. Nothing was sent.",
        details,
      );
    }
    throw new SendError(
      "PAYPAL_DECLINED",
      error.message || "PayPal declined the payout.",
      details,
    );
  }

  async function approve(
    userId: string,
    draftId: string,
    idempotencyKey: string,
  ): Promise<SendDraft> {
    const byKey = await deps.sends.getByIdempotencyKey(userId, idempotencyKey);
    if (byKey && byKey.id !== draftId) {
      throw new SendError(
        "IDEMPOTENCY_KEY_REUSED",
        "That idempotency key was already used for a different send.",
      );
    }
    let row = byKey ?? (await deps.sends.get(userId, draftId));
    if (!row) throw new SendError("SEND_NOT_FOUND", "Send draft not found.");

    if (row.status === "DRAFT") {
      if (row.ruleOutcome !== "MANUAL_REVIEW") {
        throw new SendError(
          "SEND_NOT_APPROVABLE",
          row.ruleReason || "This send is blocked and cannot be approved.",
        );
      }

      // Rules, limits and the balance can change between draft and approval.
      const wallet = await getWallet(userId);
      const rules = await evaluateRules(
        userId,
        row.amount,
        row.currency,
        wallet,
      );
      const stamp = now().toISOString();
      if (rules.ruleOutcome === "BLOCK") {
        const blocked = await deps.sends.updateIfStatus(
          userId,
          row.id,
          "DRAFT",
          {
            status: "FAILED",
            ruleOutcome: "BLOCK",
            ruleReason: rules.ruleReason,
            balanceAfterSend: null,
            updatedAt: stamp,
          },
        );
        if (blocked) {
          await record(row, "SEND_FAILED", {
            reason: "BLOCKED_AT_APPROVAL",
            ruleReason: rules.ruleReason,
          });
          throw new SendError("SEND_NOT_APPROVABLE", rules.ruleReason);
        }
      } else {
        // Only one approval can move the draft to PAYING, and its key is
        // stored before PayPal is called, so a retry reuses it.
        const claimed = await deps.sends.updateIfStatus(
          userId,
          row.id,
          "DRAFT",
          {
            status: "PAYING",
            idempotencyKey,
            sentAt: stamp,
            updatedAt: stamp,
          },
        );
        if (claimed) {
          await record(row, "SEND_APPROVED", {
            amount: row.amount,
            currency: row.currency,
            recipientEmail: row.recipientEmail,
          });
        }
      }
      row = await deps.sends.get(userId, draftId);
      if (!row) throw new SendError("SEND_NOT_FOUND", "Send draft not found.");
    }

    // A PAYING send is finished only with the key it was approved with:
    // a retry of that approval, after a crash or a PayPal outage.
    if (row.status === "PAYING" && row.idempotencyKey === idempotencyKey) {
      return publicDraft(await pay(row));
    }
    return publicDraft(row);
  }

  /** Checks PayPal for a sent payout's latest status. Never pays. */
  async function refresh(userId: string, draftId: string): Promise<SendDraft> {
    const row = await deps.sends.get(userId, draftId);
    if (!row) throw new SendError("SEND_NOT_FOUND", "Send draft not found.");
    // Nothing at PayPal to check yet. An unfinished PAYING send is never
    // marked failed here: PayPal may have paid it. Finish sending resolves it.
    if (!row.payoutBatchId) return publicDraft(row);

    let next: StoredSendDraft;
    let reason: string | null;
    if (row.payoutItemId) {
      const item = await lookUp("getPayoutItem", row, () =>
        deps.paypal.getPayoutItem(row.payoutItemId!),
      );
      next = {
        ...row,
        payoutStatus: mapPayoutStatus(item.transactionStatus),
        payoutBatchId: item.payoutBatchId ?? row.payoutBatchId,
      };
      reason = item.errorMessage ?? null;
    } else {
      const batch = await lookUp("getPayoutBatch", row, () =>
        deps.paypal.getPayoutBatch(row.payoutBatchId!),
      );
      next = {
        ...row,
        payoutItemId: batch.payoutItemId,
        payoutStatus: payoutOutcome(batch),
      };
      reason = batch.errorMessage ?? null;
    }
    const unchanged =
      next.payoutStatus === row.payoutStatus &&
      next.payoutItemId === row.payoutItemId &&
      statusFor(next.payoutStatus) === row.status;
    // A send that failed before FinPal kept PayPal's reason gets it now.
    const reasonMissing =
      statusFor(next.payoutStatus) === "FAILED" &&
      reason !== null &&
      !row.ruleReason.includes(reason);
    if (unchanged && !reasonMissing) return publicDraft(row);
    return publicDraft(await settle(row, next, reason));
  }

  async function listSends(userId: string, limit = 50): Promise<SendDraft[]> {
    const rows = await deps.sends.list(
      userId,
      Math.max(1, Math.min(limit, 100)),
    );
    return rows.map(publicDraft);
  }

  return { getWallet, createDraft, getDraft, listSends, approve, refresh };
}
