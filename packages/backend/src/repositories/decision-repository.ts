import type { DecisionOutcome } from "@finpal/contracts";

/** The decision plus the proposal details needed to create a PayPal order. */
export interface PayableDecision {
  decisionId: string;
  userId: string;
  outcome: DecisionOutcome;
  productName: string;
  amount: number;
  currency: string;
}

export interface DecisionRepository {
  findForPayment(
    userId: string,
    decisionId: string,
  ): Promise<PayableDecision | null>;
}
