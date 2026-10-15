import { z } from "zod";

import { decisionOutcomeSchema, trustSignalSchema } from "./decision";
import { paymentStatusSchema } from "./payment";
import { proposalSourceSchema } from "./proposal";
import { qualityScoreSchema } from "./quality-score";

/**
 * One dashboard row per decision: the proposal it was made for, the
 * evaluation behind it, and the payment (if one was started).
 */
export const decisionRowSchema = z.object({
  decisionId: z.uuid(),
  decidedAt: z.string(),
  outcome: decisionOutcomeSchema,
  /** One-line explanation of the decision. */
  reason: z.string(),
  reasonCodes: z.array(z.string()),

  proposalId: z.uuid(),
  productName: z.string(),
  amount: z.number(),
  currency: z.string().length(3),
  source: proposalSourceSchema,
  proposalCreatedAt: z.string(),

  evaluationId: z.uuid(),
  qualityScore: qualityScoreSchema,
  qualityExplanation: z.string(),
  medianPrice: z.number().nullable(),
  offerCount: z.number().int().nonnegative(),
  trustSignal: trustSignalSchema,

  /** Exact uppercase payment state, or null if no payment was started. */
  paymentId: z.uuid().nullable(),
  paymentStatus: paymentStatusSchema.nullable(),
  paymentUpdatedAt: z.string().nullable(),
});

export type DecisionRow = z.infer<typeof decisionRowSchema>;

export const decisionRowsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type DecisionRowsQuery = z.infer<typeof decisionRowsQuerySchema>;
