import { z } from "zod";

import {
  decisionOutcomeSchema,
  decisionRowSchema,
  decisionSchema,
  evaluationSchema,
  paymentAttemptSchema,
  paymentStatusSchema,
  proposalSchema,
  proposalSourceSchema,
  qualityScoreSchema,
  reviewStatusSchema,
  trustSignalSchema,
  type DecisionRow,
} from "@finpal/contracts";

import type {
  DashboardRepository,
  DecisionRecord,
} from "../dashboard-repository";
import { queryRow, queryRows, type Db } from "./db";
import { toPaymentAttemptRecord } from "./postgres-payment-attempt-repository";

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
  review_status: reviewStatusSchema.nullable(),
  evaluations: z.object({
    id: z.string(),
    quality_score: qualityScoreSchema,
    explanation: z.string(),
    median_price: z.coerce.number().nullable(),
    offer_count: z.number().int(),
    trust_signal: trustSignalSchema,
    proposals: z.object({
      id: z.string(),
      product_name: z.string(),
      proposed_price: z.coerce.number(),
      currency: z.string(),
      source: proposalSourceSchema,
      created_at: z.string(),
    }),
  }),
  // One-to-many: a decision can have a voided attempt and a retry.
  payment_attempts: z.array(paymentSchema).nullish(),
});

// Each decision with its evaluation, proposal and payment attempts nested as
// JSON, so one query returns everything a dashboard row needs.
const decisionRowSelect = `
  select jsonb_build_object(
    'id', d.id,
    'outcome', d.outcome,
    'reason', d.reason,
    'reasons', d.reasons,
    'decided_at', d.decided_at,
    'review_status', d.review_status,
    'evaluations', jsonb_build_object(
      'id', e.id,
      'quality_score', e.quality_score,
      'explanation', e.explanation,
      'median_price', e.median_price,
      'offer_count', e.offer_count,
      'trust_signal', e.trust_signal,
      'proposals', jsonb_build_object(
        'id', p.id,
        'product_name', p.product_name,
        'proposed_price', p.proposed_price,
        'currency', p.currency,
        'source', p.source,
        'created_at', p.created_at
      )
    ),
    'payment_attempts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pa.id, 'status', pa.status, 'updated_at', pa.updated_at
      )), '[]'::jsonb)
      from public.payment_attempts pa where pa.decision_id = d.id
    )
  ) as row
  from public.decisions d
  join public.evaluations e on e.id = d.evaluation_id
  join public.proposals p on p.id = e.proposal_id
`;

/** Flattens one nested decision row into a dashboard row. */
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
    reviewStatus: row.review_status,
    paymentId: payment?.id ?? null,
    paymentStatus: payment?.status ?? null,
    paymentUpdatedAt: payment?.updated_at ?? null,
  });
}

const detailRowSchema = z.object({
  id: z.string(),
  evaluation_id: z.string(),
  outcome: decisionOutcomeSchema,
  reason: z.string(),
  reasons: z.unknown(),
  decided_at: z.string(),
  reviewer_id: z.string().nullable(),
  review_status: reviewStatusSchema.nullable(),
  reviewed_at: z.string().nullable(),
  evaluations: z.object({
    id: z.string(),
    proposal_id: z.string(),
    quality_result: z.unknown(),
    constraint_check: z.unknown(),
    trust_signal: trustSignalSchema,
    trust_evidence: z.record(z.string(), z.unknown()).default({}),
    created_at: z.string(),
    proposals: z.object({
      id: z.string(),
      product_name: z.string(),
      proposed_price: z.coerce.number(),
      currency: z.string(),
      source: proposalSourceSchema,
      source_event_id: z.string().nullable(),
      proposed_for: z.string().nullable(),
      created_at: z.string(),
    }),
  }),
  payment_attempts: z
    .array(z.object({ updated_at: z.string() }).loose())
    .nullish(),
});

const decisionDetailSelect = `
  select to_jsonb(d) || jsonb_build_object(
    'evaluations', to_jsonb(e) || jsonb_build_object('proposals', to_jsonb(p)),
    'payment_attempts', (
      select coalesce(jsonb_agg(to_jsonb(pa)), '[]'::jsonb)
      from public.payment_attempts pa where pa.decision_id = d.id
    )
  ) as row
  from public.decisions d
  join public.evaluations e on e.id = d.evaluation_id
  join public.proposals p on p.id = e.proposal_id
`;

/** Maps one nested decision row (decisionDetailSelect) to its parts. */
export function toDecisionRecord(raw: unknown): DecisionRecord {
  const row = detailRowSchema.parse(raw);
  const evaluation = row.evaluations;
  const proposal = evaluation.proposals;
  const latestPayment = [...(row.payment_attempts ?? [])].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  )[0];

  return {
    proposal: proposalSchema.parse({
      id: proposal.id,
      productName: proposal.product_name,
      proposedPrice: proposal.proposed_price,
      currency: proposal.currency,
      source: proposal.source,
      sourceEventId: proposal.source_event_id,
      proposedFor: proposal.proposed_for,
      createdAt: proposal.created_at,
    }),
    evaluation: evaluationSchema.parse({
      id: evaluation.id,
      proposalId: evaluation.proposal_id,
      quality: evaluation.quality_result,
      constraintCheck: evaluation.constraint_check ?? null,
      trustSignal: evaluation.trust_signal,
      trustEvidence: evaluation.trust_evidence ?? {},
      createdAt: evaluation.created_at,
    }),
    decision: decisionSchema.parse({
      id: row.id,
      evaluationId: row.evaluation_id,
      outcome: row.outcome,
      reason: row.reason,
      reasons: row.reasons,
      decidedAt: row.decided_at,
      reviewerId: row.reviewer_id,
      reviewStatus: row.review_status,
      reviewedAt: row.reviewed_at,
    }),
    // paymentAttemptSchema drops internal fields (user id, idempotency key).
    payment: latestPayment
      ? paymentAttemptSchema.parse(toPaymentAttemptRecord(latestPayment))
      : null,
  };
}

// Every query filters by the signed-in user's id.
export function createPostgresDashboardRepository(db: Db): DashboardRepository {
  return {
    async getDecision(userId, decisionId) {
      const row = await queryRow(
        db,
        `${decisionDetailSelect} where d.user_id = $1 and d.id = $2`,
        [userId, decisionId],
      );
      return row ? toDecisionRecord(row) : null;
    },

    async listDecisionRows(userId, query) {
      const rows = await queryRows(
        db,
        `${decisionRowSelect} where d.user_id = $1
         order by d.decided_at desc limit $2`,
        [userId, query.limit],
      );
      return rows.map(toDecisionRow);
    },
  };
}
