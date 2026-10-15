import type {
  DecisionDetail,
  DecisionRow,
  DecisionRowsQuery,
} from "@finpal/contracts";

export type DecisionRecord = Omit<DecisionDetail, "events">;

export interface DashboardRepository {
  /** Newest decisions first, each joined to its proposal, evaluation and payment. */
  listDecisionRows(
    userId: string,
    query: DecisionRowsQuery,
  ): Promise<DecisionRow[]>;
  /** One decision with its proposal, full evaluation and latest payment. */
  getDecision(
    userId: string,
    decisionId: string,
  ): Promise<DecisionRecord | null>;
}
