import type { DecisionRow, DecisionRowsQuery } from "@finpal/contracts";

export interface DashboardRepository {
  /** Newest decisions first, each joined to its proposal, evaluation and payment. */
  listDecisionRows(
    userId: string,
    query: DecisionRowsQuery,
  ): Promise<DecisionRow[]>;
}
