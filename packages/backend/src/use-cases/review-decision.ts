import type { Decision, ReviewStatus } from "@finpal/contracts";

import type { AuditLog } from "../services/audit-log";
import type { DecisionRepository } from "../repositories/decision-repository";

export class ReviewError extends Error {
  constructor(
    readonly code:
      "DECISION_NOT_FOUND" | "NOT_MANUAL_REVIEW" | "ALREADY_REVIEWED",
    message: string,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

export interface ReviewDecisionServiceDeps {
  decisions: DecisionRepository;
  audit: Pick<AuditLog, "record">;
  now?: () => Date;
}

export type ReviewDecisionService = ReturnType<
  typeof createReviewDecisionService
>;

/**
 * Day 14: the signed-in user approves or rejects a MANUAL_REVIEW decision.
 * Approval gates PayPal authorization; rejection is audited and not payable.
 */
export function createReviewDecisionService(deps: ReviewDecisionServiceDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    async reviewDecision(
      userId: string,
      decisionId: string,
      action: ReviewStatus,
    ): Promise<Decision> {
      const current = await deps.decisions.findById(userId, decisionId);
      if (!current) {
        throw new ReviewError("DECISION_NOT_FOUND", "Decision not found.");
      }
      if (current.outcome !== "MANUAL_REVIEW") {
        throw new ReviewError(
          "NOT_MANUAL_REVIEW",
          `Only MANUAL_REVIEW decisions can be ${action.toLowerCase()}.`,
        );
      }
      if (current.reviewStatus !== null) {
        throw new ReviewError(
          "ALREADY_REVIEWED",
          `This decision was already ${current.reviewStatus.toLowerCase()}.`,
        );
      }

      const reviewedAt = now().toISOString();
      const decision = await deps.decisions.setReview(userId, decisionId, {
        reviewerId: userId,
        reviewStatus: action,
        reviewedAt,
      });
      if (!decision) {
        throw new ReviewError(
          "ALREADY_REVIEWED",
          `This decision was already reviewed.`,
        );
      }

      await deps.audit.record({
        userId,
        entityType: "decision",
        entityId: decision.id,
        type: action === "APPROVED" ? "DECISION_APPROVED" : "DECISION_REJECTED",
        payload: {
          outcome: decision.outcome,
          reviewStatus: action,
          reviewerId: userId,
          reviewedAt,
        },
      });

      return decision;
    },
  };
}
