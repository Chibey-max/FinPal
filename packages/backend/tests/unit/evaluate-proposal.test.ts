import type {
  CreateProposalInput,
  Proposal,
  QualityScore,
  SpendingConstraints,
  TrustSignal,
} from "@finpal/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import type {
  EvaluationRepository,
  NewEvaluation,
} from "../../src/repositories/evaluation-repository";
import type { ProposalRepository } from "../../src/repositories/proposal-repository";
import type { QualityScoreService } from "../../src/services/quality-score-service";
import {
  createEvaluationService,
  EvaluationError,
  type EvaluationService,
} from "../../src/use-cases/evaluate-proposal";
import {
  createInMemoryAudit,
  createInMemoryPayments,
} from "../support/in-memory";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
// Wednesday 21 Oct 2026, 12:00 in Lagos (UTC+1).
const now = new Date("2026-10-21T11:00:00Z");

const limits: SpendingConstraints = {
  timezone: "Africa/Lagos",
  currency: "USD",
  timeWindows: [
    { days: ["MON", "TUE", "WED", "THU", "FRI"], start: "09:00", end: "18:00" },
  ],
  amountCaps: { perPurchase: 100, daily: 120 },
};

const lamp: CreateProposalInput = {
  productName: "Desk lamp",
  proposedPrice: 50,
  currency: "USD",
  source: "MANUAL",
};

let sequence = 0;
const uuid = () =>
  `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;

function createProposals(): ProposalRepository {
  const rows: (Proposal & { userId: string })[] = [];
  return {
    async create(owner, input) {
      const proposal: Proposal = {
        id: uuid(),
        productName: input.productName,
        proposedPrice: input.proposedPrice,
        currency: input.currency,
        source: input.source,
        sourceEventId: input.sourceEventId ?? null,
        proposedFor: input.proposedFor ?? null,
        createdAt: now.toISOString(),
      };
      rows.push({ ...proposal, userId: owner });
      return proposal;
    },
    async findById(owner, id) {
      const row = rows.find((r) => r.userId === owner && r.id === id);
      if (!row) return null;
      const { userId: _owner, ...proposal } = row;
      return proposal;
    },
  };
}

function createEvaluations() {
  const recorded: NewEvaluation[] = [];
  const repository: EvaluationRepository = {
    async record(input) {
      recorded.push(input);
      const evaluationId = uuid();
      return {
        evaluation: {
          id: evaluationId,
          proposalId: input.proposalId,
          quality: input.quality,
          constraintCheck: input.constraintCheck,
          trustSignal: input.trustSignal,
          createdAt: now.toISOString(),
        },
        decision: {
          id: uuid(),
          evaluationId,
          ...input.decision,
          decidedAt: now.toISOString(),
        },
      };
    },
  };
  return { recorded, repository };
}

/** Quality service stub returning a fixed score with a median of 50. */
function qualityReturning(score: QualityScore): QualityScoreService {
  return {
    async score(input) {
      return {
        score,
        explanation: `Scored ${score}.`,
        proposedPrice: input.proposedPrice,
        currency: input.currency,
        offerCount: score === "INSUFFICIENT_DATA" ? 1 : 3,
        medianPrice: score === "INSUFFICIENT_DATA" ? null : 50,
        lowestPrice: 45,
        ratioToMedian: null,
        thresholds: { goodMaxRatio: 1.05, fairMaxRatio: 1.2 },
        offerStatus:
          score === "INSUFFICIENT_DATA" ? "INSUFFICIENT_OFFERS" : "OK",
        references: [],
      };
    },
  };
}

describe("evaluation service", () => {
  let payments: ReturnType<typeof createInMemoryPayments>;
  let audit: ReturnType<typeof createInMemoryAudit>;
  let evaluations: ReturnType<typeof createEvaluations>;
  let savedLimits: SpendingConstraints | null;

  function service(
    score: QualityScore = "GOOD",
    trust: TrustSignal = "NOT_CHECKED",
  ): EvaluationService {
    return createEvaluationService({
      proposals,
      constraints: {
        get: async (owner) => (owner === userId ? savedLimits : null),
      },
      payments,
      quality: qualityReturning(score),
      evaluations: evaluations.repository,
      audit: audit.log,
      trust: { check: async () => trust },
      now: () => now,
    });
  }

  let proposals: ProposalRepository;

  beforeEach(() => {
    proposals = createProposals();
    payments = createInMemoryPayments();
    audit = createInMemoryAudit();
    evaluations = createEvaluations();
    savedLimits = limits;
  });

  async function evaluate(
    input: Partial<CreateProposalInput> = {},
    svc = service(),
  ) {
    const proposal = await svc.createProposal(userId, { ...lamp, ...input });
    return svc.evaluateProposal(userId, proposal.id);
  }

  it("auto-approves a good price within every rule, and stores and audits it", async () => {
    const result = await evaluate();

    expect(result.decision.outcome).toBe("AUTO_APPROVE");
    expect(result.evaluation.constraintCheck).toEqual({
      constraints: "PASS",
      amount: "UNDER_CAP",
      reasons: [],
    });
    expect(result.evaluation.trustSignal).toBe("NOT_CHECKED");
    expect(evaluations.recorded).toHaveLength(1);
    expect(audit.types()).toEqual([
      "PROPOSAL_CREATED",
      "EVALUATION_COMPLETED",
      "DECISION_RECORDED",
    ]);
    expect(audit.events.at(-1)).toMatchObject({
      entityType: "decision",
      entityId: result.decision.id,
      payload: {
        outcome: "AUTO_APPROVE",
        reasonCodes: ["ALL_CHECKS_PASSED"],
        amount: 50,
        currency: "USD",
      },
    });
  });

  it("blocks a price over the per-purchase cap", async () => {
    const result = await evaluate({ proposedPrice: 100.01 });
    expect(result.decision.outcome).toBe("BLOCK");
    expect(result.decision.reasons.map((r) => r.code)).toEqual([
      "OVER_AMOUNT_CAP",
    ]);
  });

  it("counts today's committed spending in the user's timezone against the daily cap", async () => {
    // 80 authorized at 09:00 Lagos today; 80 + 50 > 120 daily cap.
    await payments.insert({
      userId,
      decisionId: uuid(),
      idempotencyKey: "today-1",
      status: "AUTHORIZED",
      amount: 80,
      currency: "USD",
      paypalOrderId: "O1",
      paypalOrderStatus: "COMPLETED",
      paypalAuthorizationId: "A1",
      paypalAuthorizationStatus: "CREATED",
      paypalCaptureId: null,
      paypalCaptureStatus: null,
      approveUrl: null,
    });
    payments.rows[0]!.createdAt = "2026-10-21T08:00:00Z";

    const result = await evaluate();
    expect(result.decision.outcome).toBe("BLOCK");
    expect(result.decision.reasons[0]!.message).toContain("daily cap");
  });

  it("ignores spending from the user's previous day", async () => {
    await payments.insert({
      userId,
      decisionId: uuid(),
      idempotencyKey: "yesterday-1",
      status: "CAPTURED",
      amount: 80,
      currency: "USD",
      paypalOrderId: "O2",
      paypalOrderStatus: "COMPLETED",
      paypalAuthorizationId: "A2",
      paypalAuthorizationStatus: "CAPTURED",
      paypalCaptureId: "C2",
      paypalCaptureStatus: "COMPLETED",
      approveUrl: null,
    });
    // 22:30 UTC on the 20th is 23:30 on the 20th in Lagos: yesterday.
    payments.rows[0]!.createdAt = "2026-10-20T22:30:00Z";

    expect((await evaluate()).decision.outcome).toBe("AUTO_APPROVE");
  });

  it("checks time windows at the planned purchase time", async () => {
    // Saturday is outside the weekday window.
    const result = await evaluate({ proposedFor: "2026-10-24T11:00:00+01:00" });
    expect(result.decision.outcome).toBe("BLOCK");
    expect(result.decision.reasons[0]!.code).toBe("CONSTRAINTS_FAILED");
  });

  it("sends insufficient price data to manual review", async () => {
    const result = await evaluate({}, service("INSUFFICIENT_DATA"));
    expect(result.decision.outcome).toBe("MANUAL_REVIEW");
    expect(result.decision.reasons.map((r) => r.code)).toEqual([
      "INSUFFICIENT_DATA",
    ]);
  });

  it("blocks a poor price", async () => {
    expect((await evaluate({}, service("POOR"))).decision.outcome).toBe(
      "BLOCK",
    );
  });

  it("never auto-approves when the merchant failed the trust check", async () => {
    const result = await evaluate({}, service("GOOD", "FAIL"));
    expect(result.decision.outcome).toBe("MANUAL_REVIEW");
    expect(result.evaluation.trustSignal).toBe("FAIL");
  });

  it("never auto-approves a user with no spending limits", async () => {
    savedLimits = null;
    const result = await evaluate();
    expect(result.decision.outcome).toBe("MANUAL_REVIEW");
    expect(result.evaluation.constraintCheck).toBeNull();
  });

  it("does not evaluate another user's proposal", async () => {
    const svc = service();
    const proposal = await svc.createProposal(userId, lamp);
    await expect(
      svc.evaluateProposal(otherUserId, proposal.id),
    ).rejects.toBeInstanceOf(EvaluationError);
    expect(evaluations.recorded).toHaveLength(0);
  });

  it("audits proposal creation", async () => {
    const proposal = await service().createProposal(userId, lamp);
    expect(audit.events[0]).toMatchObject({
      entityType: "proposal",
      entityId: proposal.id,
      type: "PROPOSAL_CREATED",
      payload: { productName: "Desk lamp", amount: 50, currency: "USD" },
    });
  });
});
