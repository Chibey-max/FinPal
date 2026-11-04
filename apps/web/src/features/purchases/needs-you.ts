import type { DecisionRow } from "@finpal/contracts";

/** A person has to act: review it, or pay for what was approved. */
export function needsYou(row: DecisionRow) {
  if (row.paymentStatus) return false;
  if (row.outcome === "MANUAL_REVIEW") return row.reviewStatus !== "REJECTED";
  return row.outcome === "AUTO_APPROVE";
}
