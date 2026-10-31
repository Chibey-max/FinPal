import { z } from "zod";

import {
  decisionOutcomeSchema,
  decisionSchema,
  reviewStatusSchema,
} from "@finpal/contracts";

import type { DecisionRepository } from "../decision-repository";
import { queryRow, type Db } from "./db";

const proposalSchema = z.object({
  product_name: z.string(),
  proposed_price: z.coerce.number(),
  currency: z.string(),
});

const payableRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  outcome: decisionOutcomeSchema,
  review_status: reviewStatusSchema.nullable(),
  proposal: proposalSchema,
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

export function createPostgresDecisionRepository(db: Db): DecisionRepository {
  return {
    async findById(userId, decisionId) {
      const row = await queryRow(
        db,
        `select to_jsonb(d) as row from public.decisions d
         where id = $1 and user_id = $2`,
        [decisionId, userId],
      );
      return row ? toDecision(decisionRowSchema.parse(row)) : null;
    },

    async findForPayment(userId, decisionId) {
      const raw = await queryRow(
        db,
        `select jsonb_build_object(
           'id', d.id,
           'user_id', d.user_id,
           'outcome', d.outcome,
           'review_status', d.review_status,
           'proposal', jsonb_build_object(
             'product_name', p.product_name,
             'proposed_price', p.proposed_price,
             'currency', p.currency
           )
         ) as row
         from public.decisions d
         join public.evaluations e on e.id = d.evaluation_id
         join public.proposals p on p.id = e.proposal_id
         where d.id = $1 and d.user_id = $2`,
        [decisionId, userId],
      );
      if (!raw) return null;

      const row = payableRowSchema.parse(raw);
      return {
        decisionId: row.id,
        userId: row.user_id,
        outcome: row.outcome,
        reviewStatus: row.review_status,
        productName: row.proposal.product_name,
        amount: row.proposal.proposed_price,
        currency: row.proposal.currency,
      };
    },

    async setReview(userId, decisionId, patch) {
      const row = await queryRow(
        db,
        `update public.decisions d
         set reviewer_id = $3, review_status = $4, reviewed_at = $5
         where id = $1 and user_id = $2
           and outcome = 'MANUAL_REVIEW' and review_status is null
         returning to_jsonb(d) as row`,
        [
          decisionId,
          userId,
          patch.reviewerId,
          patch.reviewStatus,
          patch.reviewedAt,
        ],
      );
      return row ? toDecision(decisionRowSchema.parse(row)) : null;
    },
  };
}
