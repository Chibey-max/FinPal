import type {
  DecisionOutcome,
  DecisionRow,
  PaymentStatus,
} from "@finpal/contracts";

export interface DashboardFilters {
  outcome: DecisionOutcome | "ALL";
  /** "NONE" = no payment started yet. */
  payment: PaymentStatus | "NONE" | "ALL";
}

export const defaultFilters: DashboardFilters = {
  outcome: "ALL",
  payment: "ALL",
};

export function hasActiveFilters(filters: DashboardFilters) {
  return filters.outcome !== "ALL" || filters.payment !== "ALL";
}

/** Toolbar filters applied on top of AG Grid's search and column filters. */
export function passesFilters(row: DecisionRow, filters: DashboardFilters) {
  if (filters.outcome !== "ALL" && row.outcome !== filters.outcome) {
    return false;
  }
  if (filters.payment === "NONE") return row.paymentStatus === null;
  if (filters.payment !== "ALL") return row.paymentStatus === filters.payment;
  return true;
}

/** Counts per outcome, shown on the toolbar toggles. */
export function countByOutcome(rows: readonly DecisionRow[]) {
  const counts: Record<DecisionOutcome | "ALL", number> = {
    ALL: rows.length,
    AUTO_APPROVE: 0,
    MANUAL_REVIEW: 0,
    BLOCK: 0,
  };
  for (const row of rows) counts[row.outcome]++;
  return counts;
}
