import { describe, expect, it } from "vitest";

import { toDecisionRow } from "../../src/repositories/supabase/supabase-dashboard-repository";

// Shaped like a PostgREST response for decisionRowSelect.
function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    outcome: "AUTO_APPROVE",
    reason: "Approved: within your rules.",
    reasons: [{ code: "ALL_CHECKS_PASSED", source: "decision", message: "ok" }],
    decided_at: "2026-10-23T10:00:00+00:00",
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
