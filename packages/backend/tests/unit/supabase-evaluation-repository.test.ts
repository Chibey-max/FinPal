import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { NewEvaluation } from "../../src/repositories/evaluation-repository";
import {
  createSupabaseEvaluationRepository,
  toRecordedEvaluation,
} from "../../src/repositories/supabase/supabase-evaluation-repository";

// Captured from public.record_evaluation_with_decision on Postgres 17.
const rpcResult = {
  decision: {
    id: "50b8c8ec-cb6d-44cb-a98c-0e410d6653ca",
    reason: "Approved: ok",
    outcome: "AUTO_APPROVE",
    reasons: [{ code: "ALL_CHECKS_PASSED", source: "decision", message: "ok" }],
    user_id: "11111111-1111-4111-8111-111111111111",
    decided_at: "2026-10-21T09:44:36.869637+00:00",
    reviewed_at: null,
    reviewer_id: null,
    evaluation_id: "1d4c0069-d583-48ef-a55c-befa4ec3593a",
    review_status: null,
  },
  evaluation: {
    id: "1d4c0069-d583-48ef-a55c-befa4ec3593a",
    user_id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-10-21T09:44:36.869637+00:00",
    explanation: "ok",
    offer_count: 3,
    proposal_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    lowest_price: 45.0,
    median_price: 50.0,
    trust_signal: "NOT_CHECKED",
    channel3_refs: [],
    quality_score: "GOOD",
    offer_currency: "USD",
    quality_result: {
      score: "GOOD",
      currency: "USD",
      offerCount: 3,
      references: [],
      thresholds: { fairMaxRatio: 1.2, goodMaxRatio: 1.05 },
      explanation: "ok",
      lowestPrice: 45,
      medianPrice: 50,
      offerStatus: "OK",
      proposedPrice: 50,
      ratioToMedian: 1,
    },
    trust_evidence: {},
    constraint_check: null,
  },
};

const input: NewEvaluation = {
  userId: "11111111-1111-4111-8111-111111111111",
  proposalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  quality: rpcResult.evaluation.quality_result as NewEvaluation["quality"],
  constraintCheck: null,
  trustSignal: "NOT_CHECKED",
  trustEvidence: {},
  decision: {
    outcome: "AUTO_APPROVE",
    reason: "Approved: ok",
    reasons: [{ code: "ALL_CHECKS_PASSED", source: "decision", message: "ok" }],
  },
};

function fakeDb(result: { data: unknown; error: unknown }) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return result;
    },
    from: () => {
      throw new Error("Evaluations must not be written table by table.");
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

describe("Supabase evaluation repository", () => {
  it("writes the evaluation and decision in one database function call", async () => {
    const { db, calls } = fakeDb({ data: rpcResult, error: null });
    await createSupabaseEvaluationRepository(db).record(input);

    expect(calls).toEqual([
      {
        fn: "record_evaluation_with_decision",
        args: {
          p_user_id: input.userId,
          p_proposal_id: input.proposalId,
          p_quality: input.quality,
          p_constraint_check: null,
          p_trust_signal: "NOT_CHECKED",
          p_trust_evidence: {},
          p_outcome: "AUTO_APPROVE",
          p_reason: "Approved: ok",
          p_reasons: input.decision.reasons,
        },
      },
    ]);
  });

  it("maps the function result to the evaluation and decision", () => {
    const { evaluation, decision } = toRecordedEvaluation(rpcResult);
    expect(evaluation).toMatchObject({
      id: "1d4c0069-d583-48ef-a55c-befa4ec3593a",
      proposalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      constraintCheck: null,
      trustSignal: "NOT_CHECKED",
      quality: { score: "GOOD", medianPrice: 50 },
    });
    expect(decision).toMatchObject({
      id: "50b8c8ec-cb6d-44cb-a98c-0e410d6653ca",
      evaluationId: evaluation.id,
      outcome: "AUTO_APPROVE",
      reviewStatus: null,
    });
  });

  it("surfaces a database error, which means nothing was stored", async () => {
    const failure = { code: "23514", message: "decisions_reasons_check" };
    const { db } = fakeDb({ data: null, error: failure });
    await expect(
      createSupabaseEvaluationRepository(db).record(input),
    ).rejects.toBe(failure);
  });
});
