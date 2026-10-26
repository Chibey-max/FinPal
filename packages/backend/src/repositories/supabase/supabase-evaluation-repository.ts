import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  constraintCheckSchema,
  decisionSchema,
  evaluationSchema,
  qualityScoreResultSchema,
  type Decision,
  type Evaluation,
} from "@finpal/contracts";

import type { EvaluationRepository } from "../evaluation-repository";

// Shape returned by public.record_evaluation_with_decision: both rows as
// to_jsonb(row), i.e. snake_case column names.
const resultSchema = z.object({
  evaluation: z.object({
    id: z.string(),
    proposal_id: z.string(),
    quality_result: z.unknown(),
    constraint_check: z.unknown(),
    trust_signal: z.string(),
    trust_evidence: z.record(z.string(), z.unknown()).nullish(),
    created_at: z.string(),
  }),
  decision: z.object({
    id: z.string(),
    evaluation_id: z.string(),
    outcome: z.string(),
    reason: z.string(),
    reasons: z.unknown(),
    decided_at: z.string(),
    reviewer_id: z.string().nullish(),
    review_status: z.string().nullish(),
    reviewed_at: z.string().nullish(),
  }),
});

/** Maps the RPC result to the evaluation and decision contracts. */
export function toRecordedEvaluation(raw: unknown): {
  evaluation: Evaluation;
  decision: Decision;
} {
  const { evaluation, decision } = resultSchema.parse(raw);
  return {
    evaluation: evaluationSchema.parse({
      id: evaluation.id,
      proposalId: evaluation.proposal_id,
      quality: qualityScoreResultSchema.parse(evaluation.quality_result),
      constraintCheck:
        evaluation.constraint_check === null
          ? null
          : constraintCheckSchema.parse(evaluation.constraint_check),
      trustSignal: evaluation.trust_signal,
      trustEvidence: evaluation.trust_evidence ?? {},
      createdAt: evaluation.created_at,
    }),
    decision: decisionSchema.parse({
      id: decision.id,
      evaluationId: decision.evaluation_id,
      outcome: decision.outcome,
      reason: decision.reason,
      reasons: decision.reasons,
      decidedAt: decision.decided_at,
      reviewerId: decision.reviewer_id ?? null,
      reviewStatus: decision.review_status ?? null,
      reviewedAt: decision.reviewed_at ?? null,
    }),
  };
}

// Evaluations and decisions are written by the backend (service role) only;
// users can read but never insert them, so a client cannot forge a decision.
export function createSupabaseEvaluationRepository(
  db: SupabaseClient,
): EvaluationRepository {
  return {
    async record(input) {
      // One database function call, so the evaluation and decision commit
      // or roll back together; never an evaluation without its decision.
      const { data, error } = await db.rpc("record_evaluation_with_decision", {
        p_user_id: input.userId,
        p_proposal_id: input.proposalId,
        p_quality: input.quality,
        p_constraint_check: input.constraintCheck,
        p_trust_signal: input.trustSignal,
        p_trust_evidence: input.trustEvidence,
        p_outcome: input.decision.outcome,
        p_reason: input.decision.reason,
        p_reasons: input.decision.reasons,
      });
      if (error) throw error;
      return toRecordedEvaluation(data);
    },
  };
}
