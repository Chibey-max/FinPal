import type {
  Decision,
  DecisionOutcome,
  ReviewStatus,
} from "@finpal/contracts";

/** The decision plus the proposal details needed to create a PayPal order. */
export interface PayableDecision {
  decisionId: string;
  userId: string;
  outcome: DecisionOutcome;
  reviewStatus: ReviewStatus | null;
  productName: string;
  amount: number;
  currency: string;
}

export interface DecisionReviewPatch {
  reviewerId: string;
  reviewStatus: ReviewStatus;
  reviewedAt: string;
}

export interface DecisionRepository {
  findById(userId: string, decisionId: string): Promise<Decision | null>;
  findForPayment(
    userId: string,
    decisionId: string,
  ): Promise<PayableDecision | null>;
  /**
   * Sets the review fields only while still unreviewed. Returns null if
   * another request won the race.
   */
  setReview(
    userId: string,
    decisionId: string,
    patch: DecisionReviewPatch,
  ): Promise<Decision | null>;
}
