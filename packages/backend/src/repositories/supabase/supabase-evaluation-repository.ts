import type { SupabaseClient } from "@supabase/supabase-js";

import {
  constraintCheckSchema,
  decisionSchema,
  evaluationSchema,
  qualityScoreResultSchema,
} from "@finpal/contracts";

import type { EvaluationRepository } from "../evaluation-repository";

// Evaluations and decisions are written by the backend (service role) only;
// users can read but never insert them, so a client cannot forge a decision.
export function createSupabaseEvaluationRepository(
  db: SupabaseClient,
): EvaluationRepository {
  return {
    async record(input) {
      const { quality } = input;

      const { data: evaluationRow, error: evaluationError } = await db
        .from("evaluations")
        .insert({
          user_id: input.userId,
          proposal_id: input.proposalId,
          quality_score: quality.score,
          explanation: quality.explanation,
          channel3_refs: quality.references,
          trust_signal: input.trustSignal,
          trust_evidence: input.trustEvidence,
          offer_count: quality.offerCount,
          median_price: quality.medianPrice,
          lowest_price: quality.lowestPrice,
          offer_currency: quality.currency,
          constraint_check: input.constraintCheck,
          quality_result: quality,
        })
        .select(
          "id, proposal_id, quality_result, constraint_check, trust_signal, trust_evidence, created_at",
        )
        .single();
      if (evaluationError) throw evaluationError;

      const { data: decisionRow, error: decisionError } = await db
        .from("decisions")
        .insert({
          user_id: input.userId,
          evaluation_id: evaluationRow.id,
          outcome: input.decision.outcome,
          reason: input.decision.reason,
          reasons: input.decision.reasons,
        })
        .select(
          "id, evaluation_id, outcome, reason, reasons, decided_at, reviewer_id, review_status, reviewed_at",
        )
        .single();
      if (decisionError) throw decisionError;

      return {
        evaluation: evaluationSchema.parse({
          id: evaluationRow.id,
          proposalId: evaluationRow.proposal_id,
          quality: qualityScoreResultSchema.parse(evaluationRow.quality_result),
          constraintCheck:
            evaluationRow.constraint_check === null
              ? null
              : constraintCheckSchema.parse(evaluationRow.constraint_check),
          trustSignal: evaluationRow.trust_signal,
          trustEvidence: evaluationRow.trust_evidence ?? {},
          createdAt: evaluationRow.created_at,
        }),
        decision: decisionSchema.parse({
          id: decisionRow.id,
          evaluationId: decisionRow.evaluation_id,
          outcome: decisionRow.outcome,
          reason: decisionRow.reason,
          reasons: decisionRow.reasons,
          decidedAt: decisionRow.decided_at,
          reviewerId: decisionRow.reviewer_id ?? null,
          reviewStatus: decisionRow.review_status ?? null,
          reviewedAt: decisionRow.reviewed_at ?? null,
        }),
      };
    },
  };
}
