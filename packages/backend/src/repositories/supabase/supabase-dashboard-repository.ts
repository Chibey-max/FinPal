import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  decisionOutcomeSchema,
  decisionRowSchema,
  paymentStatusSchema,
  proposalSourceSchema,
  qualityScoreSchema,
  trustSignalSchema,
  type DecisionRow,
} from "@finpal/contracts";

import type { DashboardRepository } from "../dashboard-repository";

// PostgREST embeds a many-to-one relation as an object; accept arrays too.
const one = <T extends z.ZodType>(schema: T) =>
  z.union([
    schema,
    z
      .array(schema)
      .length(1)
      .transform((items) => items[0]!),
  ]);

const paymentSchema = z.object({
  id: z.string(),
  status: paymentStatusSchema,
  updated_at: z.string(),
});

const rowSchema = z.object({
  id: z.string(),
  outcome: decisionOutcomeSchema,
  reason: z.string(),
  reasons: z.array(z.object({ code: z.string() }).loose()).default([]),
  decided_at: z.string(),
  evaluations: one(
    z.object({
      id: z.string(),
      quality_score: qualityScoreSchema,
      explanation: z.string(),
      median_price: z.coerce.number().nullable(),
      offer_count: z.number().int(),
      trust_signal: trustSignalSchema,
      proposals: one(
        z.object({
          id: z.string(),
          product_name: z.string(),
          proposed_price: z.coerce.number(),
          currency: z.string(),
          source: proposalSourceSchema,
          created_at: z.string(),
        }),
      ),
    }),
  ),
  // One-to-many: a decision can have a voided attempt and a retry.
  payment_attempts: z.array(paymentSchema).nullish(),
});

export const decisionRowSelect = `
  id, outcome, reason, reasons, decided_at,
  evaluations!inner (
    id, quality_score, explanation, median_price, offer_count, trust_signal,
    proposals!inner ( id, product_name, proposed_price, currency, source, created_at )
  ),
  payment_attempts ( id, status, updated_at )
`;

/** Flattens one PostgREST decision row into a dashboard row. */
export function toDecisionRow(raw: unknown): DecisionRow {
  const row = rowSchema.parse(raw);
  const evaluation = row.evaluations;
  const proposal = evaluation.proposals;
  // Show the most recently updated payment attempt.
  const payment = [...(row.payment_attempts ?? [])].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  )[0];

  return decisionRowSchema.parse({
    decisionId: row.id,
    decidedAt: row.decided_at,
    outcome: row.outcome,
    reason: row.reason,
    reasonCodes: row.reasons.map((reason) => reason.code),
    proposalId: proposal.id,
    productName: proposal.product_name,
    amount: proposal.proposed_price,
    currency: proposal.currency,
    source: proposal.source,
    proposalCreatedAt: proposal.created_at,
    evaluationId: evaluation.id,
    qualityScore: evaluation.quality_score,
    qualityExplanation: evaluation.explanation,
    medianPrice: evaluation.median_price,
    offerCount: evaluation.offer_count,
    trustSignal: evaluation.trust_signal,
    paymentId: payment?.id ?? null,
    paymentStatus: payment?.status ?? null,
    paymentUpdatedAt: payment?.updated_at ?? null,
  });
}

// Use with the signed-in user's client so RLS applies; the explicit user
// filter keeps it safe with the service role too.
export function createSupabaseDashboardRepository(
  db: SupabaseClient,
): DashboardRepository {
  return {
    async listDecisionRows(userId, query) {
      const { data, error } = await db
        .from("decisions")
        .select(decisionRowSelect)
        .eq("user_id", userId)
        .order("decided_at", { ascending: false })
        .limit(query.limit);
      if (error) throw error;
      return (data ?? []).map(toDecisionRow);
    },
  };
}
