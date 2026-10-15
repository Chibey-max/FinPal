import type { AuditEvent, DecisionDetail } from "@finpal/contracts";

import type { DashboardRepository } from "../repositories/dashboard-repository";
import type { AuditLog } from "./audit-log";

/**
 * Loads one decision for the detail drawer, with the audit trail of every
 * entity involved: proposal, evaluation, decision and payment.
 */
export function createDecisionDetailService(deps: {
  dashboard: Pick<DashboardRepository, "getDecision">;
  audit: Pick<AuditLog, "listActivity">;
}) {
  return {
    async getDecisionDetail(
      userId: string,
      decisionId: string,
    ): Promise<DecisionDetail | null> {
      const record = await deps.dashboard.getDecision(userId, decisionId);
      if (!record) return null;

      const entityIds = [
        record.proposal.id,
        record.evaluation.id,
        record.decision.id,
        ...(record.payment ? [record.payment.id] : []),
      ];
      const pages = await Promise.all(
        entityIds.map((entityId) =>
          deps.audit.listActivity(userId, { entityId, limit: 100 }),
        ),
      );

      const byId = new Map<number, AuditEvent>();
      for (const page of pages) {
        for (const event of page.events) byId.set(event.id, event);
      }
      const events = [...byId.values()].sort((a, b) => b.id - a.id);

      return { ...record, events };
    },
  };
}
