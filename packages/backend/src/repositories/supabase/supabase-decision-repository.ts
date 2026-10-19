import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  decisionOutcomeSchema,
  decisionSchema,
  reviewStatusSchema,
} from "@finpal/contracts";

import type { DecisionRepository } from "../decision-repository";

const proposalSchema = z.object({
  product_name: z.string(),
  proposed_price: z.coerce.number(),
  currency: z.string(),
});

// PostgREST embeds a many-to-one relation as an object; accept arrays too.
const one = <T extends z.ZodType>(schema: T) =>
  z.union([
    schema,
    z
      .array(schema)
      .length(1)
      .transform((items) => items[0]!),
  ]);

const payableRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  outcome: decisionOutcomeSchema,
  review_status: reviewStatusSchema.nullable(),
  evaluations: one(z.object({ proposals: one(proposalSchema) })),
});

const decisionRowSchema = z.object({
  id: z.string(),
  evaluation_id: z.string(),
  outcome: decisionOutcomeSchema,
  reason: z.string(),
  reasons: z.array(z.unknown()),
  decided_at: z.string(),
  reviewer_id: z.string().nullable(),
  review_status: reviewStatusSchema.nullable(),
  reviewed_at: z.string().nullable(),
});

function toDecision(row: z.infer<typeof decisionRowSchema>) {
  return decisionSchema.parse({
    id: row.id,
    evaluationId: row.evaluation_id,
    outcome: row.outcome,
    reason: row.reason,
    reasons: row.reasons,
    decidedAt: row.decided_at,
    reviewerId: row.reviewer_id,
    reviewStatus: row.review_status,
    reviewedAt: row.reviewed_at,
  });
}

export function createSupabaseDecisionRepository(
  db: SupabaseClient,
): DecisionRepository {
  return {
    async findById(userId, decisionId) {
      const { data, error } = await db
        .from("decisions")
        .select(
          "id, evaluation_id, outcome, reason, reasons, decided_at, reviewer_id, review_status, reviewed_at",
        )
        .eq("id", decisionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return toDecision(decisionRowSchema.parse(data));
    },

    async findForPayment(userId, decisionId) {
      const { data, error } = await db
        .from("decisions")
        .select(
          "id, user_id, outcome, review_status, evaluations!inner(proposals!inner(product_name, proposed_price, currency))",
        )
        .eq("id", decisionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const row = payableRowSchema.parse(data);
      const proposal = row.evaluations.proposals;
      return {
        decisionId: row.id,
        userId: row.user_id,
        outcome: row.outcome,
        reviewStatus: row.review_status,
        productName: proposal.product_name,
        amount: proposal.proposed_price,
        currency: proposal.currency,
      };
    },

    async setReview(userId, decisionId, patch) {
      const { data, error } = await db
        .from("decisions")
        .update({
          reviewer_id: patch.reviewerId,
          review_status: patch.reviewStatus,
          reviewed_at: patch.reviewedAt,
        })
        .eq("id", decisionId)
        .eq("user_id", userId)
        .eq("outcome", "MANUAL_REVIEW")
        .is("review_status", null)
        .select(
          "id, evaluation_id, outcome, reason, reasons, decided_at, reviewer_id, review_status, reviewed_at",
        )
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return toDecision(decisionRowSchema.parse(data));
    },
  };
}
