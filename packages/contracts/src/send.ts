import { z } from "zod";

/** The shared Sandbox merchant wallet, as one user sees it (no secrets). */
export const walletSummarySchema = z.object({
  /**
   * Estimated: PayPal's balance can be up to 3 hours old, so FinPal takes
   * off what was sent since. Null when Reporting Balances isn't authorized
   * on the REST app.
   */
  available: z.number().nonnegative().nullable(),
  currency: z.string().length(3),
  /** When PayPal last refreshed the balance. */
  asOf: z.string(),
  /** Short label only, e.g. "Sandbox business". */
  accountLabel: z.string().min(1).max(80),
  /**
   * LIVE = Reporting returned a balance.
   * UNAVAILABLE = app lacks Reporting permission (Payouts can still work).
   */
  balanceStatus: z.enum(["LIVE", "UNAVAILABLE"]).default("LIVE"),
  /**
   * What this user can still send today: the lowest of the estimated
   * balance, their daily send limit and the limit for all users.
   */
  sendableToday: z.number().nonnegative(),
  /** FinPal's per-person daily send limit for the shared wallet. */
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
  /** Available balance when the draft was evaluated; null if Reporting unavailable. */
  availableAtDraft: z.number().nonnegative().nullable(),
  /** availableAtDraft − amount when under balance; null when blocked/unknown. */
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
