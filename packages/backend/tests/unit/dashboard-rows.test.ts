import { describe, expect, it } from "vitest";

import {
  toDecisionRecord,
  toDecisionRow,
} from "../../src/repositories/supabase/supabase-dashboard-repository";

// Shaped like a PostgREST response for decisionRowSelect.
function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    outcome: "AUTO_APPROVE",
    reason: "Approved: within your rules.",
    reasons: [{ code: "ALL_CHECKS_PASSED", source: "decision", message: "ok" }],
    decided_at: "2026-10-23T10:00:00+00:00",
    review_status: null,
    evaluations: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      quality_score: "GOOD",
      explanation: "$50.00 is equal to the median.",
      median_price: "50.00", // numeric columns can arrive as strings
      offer_count: 3,
      trust_signal: "NOT_CHECKED",
      proposals: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        product_name: "Desk lamp",
        proposed_price: "50.00",
        currency: "USD",
        source: "MANUAL",
        created_at: "2026-10-23T09:59:00+00:00",
      },
    },
    payment_attempts: [],
    ...overrides,
  };
}

describe("toDecisionRow", () => {
  it("flattens a decision with its proposal and evaluation", () => {
    expect(toDecisionRow(rawRow())).toEqual({
      decisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      decidedAt: "2026-10-23T10:00:00+00:00",
      outcome: "AUTO_APPROVE",
      reason: "Approved: within your rules.",
      reasonCodes: ["ALL_CHECKS_PASSED"],
      proposalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      productName: "Desk lamp",
      amount: 50,
      currency: "USD",
      source: "MANUAL",
      proposalCreatedAt: "2026-10-23T09:59:00+00:00",
      evaluationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      qualityScore: "GOOD",
      qualityExplanation: "$50.00 is equal to the median.",
      medianPrice: 50,
      offerCount: 3,
      trustSignal: "NOT_CHECKED",
      reviewStatus: null,
      paymentId: null,
      paymentStatus: null,
      paymentUpdatedAt: null,
    });
  });

  it("shows the most recently updated payment attempt", () => {
    const row = toDecisionRow(
      rawRow({
        payment_attempts: [
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            status: "VOIDED",
            updated_at: "2026-10-23T10:05:00+00:00",
          },
          {
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            status: "CAPTURED",
            updated_at: "2026-10-23T10:20:00+00:00",
          },
        ],
      }),
    );
    expect(row).toMatchObject({
      paymentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      paymentStatus: "CAPTURED",
    });
  });

  it("accepts embedded relations returned as single-item arrays", () => {
    const base = rawRow();
    const row = toDecisionRow({
      ...base,
      evaluations: [
        { ...base.evaluations, proposals: [base.evaluations.proposals] },
      ],
    });
    expect(row.productName).toBe("Desk lamp");
  });

  it("keeps a null median for insufficient data", () => {
    const base = rawRow();
    const row = toDecisionRow({
      ...base,
      outcome: "MANUAL_REVIEW",
      evaluations: {
        ...base.evaluations,
        quality_score: "INSUFFICIENT_DATA",
        median_price: null,
      },
    });
    expect(row.medianPrice).toBeNull();
  });

  it("rejects payment states outside the state machine", () => {
    expect(() =>
      toDecisionRow(
        rawRow({
          payment_attempts: [
            {
              id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              status: "authorized",
              updated_at: "2026-10-23T10:05:00+00:00",
            },
          ],
        }),
      ),
    ).toThrow();
  });
});

describe("toDecisionRecord", () => {
  const quality = {
    score: "GOOD",
    explanation: "$50.00 is equal to the median.",
    proposedPrice: 50,
    currency: "USD",
    offerCount: 3,
    medianPrice: 50,
    lowestPrice: 45,
    ratioToMedian: 1,
    thresholds: { goodMaxRatio: 1.05, fairMaxRatio: 1.2 },
    offerStatus: "OK",
    references: [],
  };
  const payment = (status: string, updatedAt: string, id: string) => ({
    id,
    user_id: "11111111-1111-4111-8111-111111111111",
    decision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status,
    amount: "50.00",
    currency: "USD",
    idempotency_key: "secret-client-key",
    paypal_order_id: "ORDER-1",
    paypal_order_status: "COMPLETED",
    paypal_authorization_id: "AUTH-1",
    paypal_authorization_status: "CREATED",
    paypal_capture_id: null,
    paypal_capture_status: null,
    approve_url: null,
    created_at: "2026-10-23T10:01:00+00:00",
    updated_at: updatedAt,
  });

  const raw = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    evaluation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    outcome: "AUTO_APPROVE",
    reason: "Approved: ok",
    reasons: [{ code: "ALL_CHECKS_PASSED", source: "decision", message: "ok" }],
    decided_at: "2026-10-23T10:00:00+00:00",
    reviewer_id: null,
    review_status: null,
    reviewed_at: null,
    evaluations: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      proposal_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      quality_result: quality,
      constraint_check: null,
      trust_signal: "NOT_CHECKED",
      trust_evidence: {},
      created_at: "2026-10-23T10:00:00+00:00",
      proposals: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        product_name: "Desk lamp",
        proposed_price: "50.00",
        currency: "USD",
        source: "MANUAL",
        source_event_id: null,
        proposed_for: null,
        created_at: "2026-10-23T09:59:00+00:00",
      },
    },
    payment_attempts: [
      payment(
        "VOIDED",
        "2026-10-23T10:05:00+00:00",
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      ),
      payment(
        "AUTHORIZED",
        "2026-10-23T10:09:00+00:00",
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      ),
    ],
  };

  it("returns the proposal, full evaluation, decision and latest payment", () => {
    const record = toDecisionRecord(raw);
    expect(record.proposal.productName).toBe("Desk lamp");
    expect(record.evaluation.quality.medianPrice).toBe(50);
    expect(record.evaluation.constraintCheck).toBeNull();
    expect(record.decision.reasons[0]!.code).toBe("ALL_CHECKS_PASSED");
    expect(record.payment).toMatchObject({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      status: "AUTHORIZED",
      amount: 50,
    });
  });

  it("never exposes the user id or idempotency key of the payment", () => {
    const payment = toDecisionRecord(raw).payment!;
    expect(payment).not.toHaveProperty("userId");
    expect(payment).not.toHaveProperty("idempotencyKey");
  });

  it("returns a null payment when none was started", () => {
    expect(
      toDecisionRecord({ ...raw, payment_attempts: [] }).payment,
    ).toBeNull();
  });
});
