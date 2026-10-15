import type { AuditEntityType, AuditEventType } from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import type { DecisionRecord } from "../../src/repositories/dashboard-repository";
import { createDecisionDetailService } from "../../src/services/decision-detail";
import { createInMemoryAudit } from "../support/in-memory";

const userId = "11111111-1111-4111-8111-111111111111";

const record = {
  proposal: { id: "proposal-1" },
  evaluation: { id: "evaluation-1" },
  decision: { id: "decision-1" },
  payment: { id: "payment-1" },
} as unknown as DecisionRecord;

describe("decision detail service", () => {
  it("returns null for a decision the user cannot see", async () => {
    const service = createDecisionDetailService({
      dashboard: { getDecision: async () => null },
      audit: createInMemoryAudit().log,
    });
    expect(await service.getDecisionDetail(userId, "decision-1")).toBeNull();
  });

  it("gathers the audit trail of every entity behind the decision, newest first", async () => {
    const audit = createInMemoryAudit();
    const log = (
      entityType: AuditEntityType,
      entityId: string,
      type: AuditEventType,
    ) => audit.log.record({ userId, entityType, entityId, type, payload: {} });

    await log("proposal", "proposal-1", "PROPOSAL_CREATED");
    await log("evaluation", "evaluation-1", "EVALUATION_COMPLETED");
    await log("decision", "decision-1", "DECISION_RECORDED");
    await log("payment_attempt", "payment-1", "PAYMENT_CREATED");
    await log("payment_attempt", "payment-1", "PAYMENT_AUTHORIZED");
    // Unrelated activity must not appear.
    await log("proposal", "proposal-2", "PROPOSAL_CREATED");

    const service = createDecisionDetailService({
      dashboard: { getDecision: async () => record },
      audit: audit.log,
    });
    const detail = await service.getDecisionDetail(userId, "decision-1");

    expect(detail!.events.map((e) => e.type)).toEqual([
      "PAYMENT_AUTHORIZED",
      "PAYMENT_CREATED",
      "DECISION_RECORDED",
      "EVALUATION_COMPLETED",
      "PROPOSAL_CREATED",
    ]);
  });

  it("skips the payment lookup when no payment was started", async () => {
    const queried: string[] = [];
    const service = createDecisionDetailService({
      dashboard: { getDecision: async () => ({ ...record, payment: null }) },
      audit: {
        async listActivity(_user, query) {
          queried.push(query?.entityId ?? "");
          return { events: [], nextBefore: null };
        },
      },
    });
    await service.getDecisionDetail(userId, "decision-1");
    expect(queried).toEqual(["proposal-1", "evaluation-1", "decision-1"]);
  });
});
