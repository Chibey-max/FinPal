import { beforeEach, describe, expect, it } from "vitest";

import type { Decision } from "@finpal/contracts";

import type { DecisionRepository } from "../../src/repositories/decision-repository";
import {
  createReviewDecisionService,
  ReviewError,
} from "../../src/use-cases/review-decision";
import { createInMemoryAudit } from "../support/in-memory";

const userId = "11111111-1111-4111-8111-111111111111";
const decisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("review decision service", () => {
  let audit: ReturnType<typeof createInMemoryAudit>;
  let decision: Decision;
  let decisions: DecisionRepository;

  beforeEach(() => {
    audit = createInMemoryAudit();
    decision = {
      id: decisionId,
      evaluationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      outcome: "MANUAL_REVIEW",
      reason: "Fair price needs review.",
      reasons: [
        {
          code: "FAIR_QUALITY",
          source: "quality",
          message: "Fair",
        },
      ],
      decidedAt: "2026-10-28T10:00:00.000Z",
      reviewerId: null,
      reviewStatus: null,
      reviewedAt: null,
    };
    decisions = {
      async findById(owner, id) {
        return owner === userId && id === decisionId ? { ...decision } : null;
      },
      async findForPayment() {
        return null;
      },
      async setReview(owner, id, patch) {
        if (owner !== userId || id !== decisionId || decision.reviewStatus) {
          return null;
        }
        decision = {
          ...decision,
          reviewerId: patch.reviewerId,
          reviewStatus: patch.reviewStatus,
          reviewedAt: patch.reviewedAt,
        };
        return { ...decision };
      },
    };
  });

  it("approves a MANUAL_REVIEW decision and audits it", async () => {
    const service = createReviewDecisionService({
      decisions,
      audit: audit.log,
      now: () => new Date("2026-10-28T12:00:00.000Z"),
    });

    const result = await service.reviewDecision(userId, decisionId, "APPROVED");

    expect(result.reviewStatus).toBe("APPROVED");
    expect(result.reviewerId).toBe(userId);
    expect(audit.types()).toEqual(["DECISION_APPROVED"]);
  });

  it("rejects a MANUAL_REVIEW decision and audits it", async () => {
    const service = createReviewDecisionService({
      decisions,
      audit: audit.log,
    });

    await service.reviewDecision(userId, decisionId, "REJECTED");
    expect(decision.reviewStatus).toBe("REJECTED");
    expect(audit.types()).toEqual(["DECISION_REJECTED"]);
  });

  it("refuses a second review", async () => {
    const service = createReviewDecisionService({
      decisions,
      audit: audit.log,
    });
    await service.reviewDecision(userId, decisionId, "APPROVED");

    await expect(
      service.reviewDecision(userId, decisionId, "REJECTED"),
    ).rejects.toMatchObject({
      name: "ReviewError",
      code: "ALREADY_REVIEWED",
    } satisfies Partial<ReviewError>);
  });

  it("refuses BLOCK decisions", async () => {
    decision = { ...decision, outcome: "BLOCK" };
    const service = createReviewDecisionService({
      decisions,
      audit: audit.log,
    });

    await expect(
      service.reviewDecision(userId, decisionId, "APPROVED"),
    ).rejects.toMatchObject({ code: "NOT_MANUAL_REVIEW" });
  });
});
