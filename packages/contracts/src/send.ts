import { z } from "zod";

/**
 * Personal FinPal ledger funded by PayPal Checkout (Log in with PayPal),
 * not the shared merchant Reporting balance.
 */
export const walletSummarySchema = z.object({
  /** Ledger available; null only when disconnected (cannot send). */
  available: z.number().nonnegative().nullable(),
  currency: z.string().length(3),
  /** When the ledger was last updated. */
  asOf: z.string(),
  /** Short label, e.g. connected PayPal email or "FinPal balance". */
  accountLabel: z.string().min(1).max(80),
  /**
   * LIVE = connected with a ledger balance.
   * DISCONNECTED = must Connect PayPal before sending.
   */
  balanceStatus: z.enum(["LIVE", "DISCONNECTED"]).default("DISCONNECTED"),
  connected: z.boolean(),
  /** Connected PayPal email when linked. */
  paypalEmail: z.string().email().nullable(),
  /**
   * What this user can still send today: min of ledger, per-user daily
   * send limit, and merchant total daily safety cap.
   */
  sendableToday: z.number().nonnegative(),
  /** FinPal's per-person daily send limit. */
  dailyLimit: z.number().positive(),
});

export type WalletSummary = z.infer<typeof walletSummarySchema>;

export const payoutStatusSchema = z.enum([
  "NONE",
  "PENDING",
  "SUCCESS",
  "UNCLAIMED",
  "FAILED",
  "RETURNED",
]);

export type PayoutStatus = z.infer<typeof payoutStatusSchema>;

/** Send always needs human approval; BLOCK when rules or balance fail. */
export const sendRuleOutcomeSchema = z.enum(["MANUAL_REVIEW", "BLOCK"]);

export type SendRuleOutcome = z.infer<typeof sendRuleOutcomeSchema>;

export const sendDraftStatusSchema = z.enum([
  "DRAFT",
  "APPROVED",
  "PAYING",
  "SENT",
  "FAILED",
]);

export type SendDraftStatus = z.infer<typeof sendDraftStatusSchema>;

export const sendDraftSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  recipientEmail: z.string().email(),
  memo: z.string().max(200).nullable(),
  ruleOutcome: sendRuleOutcomeSchema,
  ruleReason: z.string(),
  /** Ledger available when the draft was evaluated. */
  availableAtDraft: z.number().nonnegative().nullable(),
  /** availableAtDraft − amount when under balance; null when blocked. */
  balanceAfterSend: z.number().nonnegative().nullable(),
  status: sendDraftStatusSchema,
  payoutBatchId: z.string().nullable(),
  payoutItemId: z.string().nullable(),
  payoutStatus: payoutStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SendDraft = z.infer<typeof sendDraftSchema>;

/** Free-text Agent message, or structured fields from a form. */
export const createSendDraftSchema = z
  .object({
    message: z.string().trim().min(3).max(500).optional(),
    amount: z.number().positive().max(1_000_000).optional(),
    currency: z.string().length(3).optional(),
    recipientEmail: z.string().email().max(254).optional(),
    memo: z.string().trim().max(200).nullable().optional(),
  })
  .refine(
    (value) =>
      Boolean(value.message) ||
      (value.amount !== undefined && Boolean(value.recipientEmail)),
    { message: "Provide a send message or amount + recipient email." },
  );

export type CreateSendDraftInput = z.infer<typeof createSendDraftSchema>;

export const approveSendSchema = z.object({
  draftId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(64),
});

export type ApproveSendInput = z.infer<typeof approveSendSchema>;

export const createTopUpSchema = z.object({
  amount: z.number().positive().max(10_000),
  currency: z.string().length(3).default("USD"),
});

export type CreateTopUpInput = z.infer<typeof createTopUpSchema>;

export const topUpSessionSchema = z.object({
  topUpId: z.string().uuid(),
  orderId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  approveUrl: z.string().url().nullable(),
});

export type TopUpSession = z.infer<typeof topUpSessionSchema>;

export const paypalConnectionStatusSchema = z.object({
  connected: z.boolean(),
  email: z.string().email().nullable(),
  payerId: z.string().nullable(),
  needsReconnect: z.boolean(),
});

export type PaypalConnectionStatus = z.infer<
  typeof paypalConnectionStatusSchema
>;
