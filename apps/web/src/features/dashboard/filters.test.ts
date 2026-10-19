import type { DecisionRow } from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import {
  countByOutcome,
  defaultFilters,
  hasActiveFilters,
  passesFilters,
} from "./filters";

function row(overrides: Partial<DecisionRow>): DecisionRow {
  return {
    decisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    decidedAt: "2026-10-24T10:00:00Z",
    outcome: "AUTO_APPROVE",
    reason: "Approved",
    reasonCodes: ["ALL_CHECKS_PASSED"],
    proposalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    productName: "Desk lamp",
    amount: 50,
    currency: "USD",
    source: "MANUAL",
    proposalCreatedAt: "2026-10-24T09:59:00Z",
    evaluationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    qualityScore: "GOOD",
    qualityExplanation: "ok",
    medianPrice: 50,
    offerCount: 3,
    trustSignal: "NOT_CHECKED",
    reviewStatus: null,
    paymentId: null,
    paymentStatus: null,
    paymentUpdatedAt: null,
    ...overrides,
  };
}

const approvedUnpaid = row({});
const approvedCaptured = row({
  paymentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  paymentStatus: "CAPTURED",
});
const blocked = row({ outcome: "BLOCK" });
const review = row({ outcome: "MANUAL_REVIEW" });
const rows = [approvedUnpaid, approvedCaptured, blocked, review];

describe("dashboard filters", () => {
  it("shows everything by default", () => {
    expect(rows.filter((r) => passesFilters(r, defaultFilters))).toHaveLength(
      4,
    );
    expect(hasActiveFilters(defaultFilters)).toBe(false);
  });

  it("filters by decision outcome", () => {
    const filters = { ...defaultFilters, outcome: "BLOCK" as const };
    expect(rows.filter((r) => passesFilters(r, filters))).toEqual([blocked]);
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("filters by exact payment state", () => {
    const filters = { ...defaultFilters, payment: "CAPTURED" as const };
    expect(rows.filter((r) => passesFilters(r, filters))).toEqual([
      approvedCaptured,
    ]);
  });

  it("finds decisions with no payment started", () => {
    const filters = { ...defaultFilters, payment: "NONE" as const };
    expect(rows.filter((r) => passesFilters(r, filters))).toHaveLength(3);
  });

  it("combines outcome and payment filters", () => {
    const filters = {
      outcome: "AUTO_APPROVE" as const,
      payment: "NONE" as const,
    };
    expect(rows.filter((r) => passesFilters(r, filters))).toEqual([
      approvedUnpaid,
    ]);
  });

  it("counts decisions per outcome", () => {
    expect(countByOutcome(rows)).toEqual({
      ALL: 4,
      AUTO_APPROVE: 2,
      MANUAL_REVIEW: 1,
      BLOCK: 1,
    });
  });
});
