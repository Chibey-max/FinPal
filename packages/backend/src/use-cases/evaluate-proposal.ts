import type {
  ComparableOffer,
  CreateProposalInput,
  Proposal,
  ProposalEvaluation,
  TrustSignal,
} from "@finpal/contracts";

import { checkConstraints } from "../domain/constraints";
import { decide } from "../domain/decision-table";
import { localDayRange, localMonthRange } from "../domain/zoned-time";
import type { KernelClient } from "../integrations/kernel/kernel-client";
import type { ConstraintsRepository } from "../repositories/constraints-repository";
import type { EvaluationRepository } from "../repositories/evaluation-repository";
import type { PaymentAttemptRepository } from "../repositories/payment-attempt-repository";
import type { ProposalRepository } from "../repositories/proposal-repository";
import type { AuditLog } from "../services/audit-log";
import type { QualityScoreService } from "../services/quality-score-service";

export interface MerchantTrustCheckResult {
  signal: TrustSignal;
  evidence: Record<string, unknown>;
}

/**
 * Merchant trust (KERNEL). Receives Channel3 reference offers so the check
 * can visit a real merchant URL. Until KERNEL is configured, every check is N/A.
 */
export interface MerchantTrustChecker {
  check(
    proposal: Proposal,
    references: ComparableOffer[],
  ): Promise<MerchantTrustCheckResult>;
}

export const trustNotConfigured: MerchantTrustChecker = {
  check: async () => ({
    signal: "NOT_CHECKED",
    evidence: { reason: "kernel_not_configured" },
  }),
};

/** Builds a trust checker that visits the cheapest reference offer via KERNEL. */
export function createKernelTrustChecker(kernel: KernelClient): MerchantTrustChecker {
  return {
    async check(proposal, references) {
      const offer = references[0];
      if (!offer?.url) {
        return {
          signal: "UNAVAILABLE",
          evidence: {
            reason: "no_merchant_url",
            productName: proposal.productName,
          },
        };
      }
      const result = await kernel.checkMerchant(offer.url);
      return {
        signal: result.signal,
        evidence: {
          merchant: offer.merchant,
          ...result.evidence,
        },
      };
    },
  };
}

export class EvaluationError extends Error {
  constructor(
    readonly code: "PROPOSAL_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "EvaluationError";
  }
}

export interface EvaluationServiceDeps {
  proposals: ProposalRepository;
  constraints: Pick<ConstraintsRepository, "get">;
  payments: Pick<PaymentAttemptRepository, "sumCommitted">;
  quality: QualityScoreService;
  evaluations: EvaluationRepository;
  audit: Pick<AuditLog, "record">;
  trust?: MerchantTrustChecker;
  now?: () => Date;
}

export type EvaluationService = ReturnType<typeof createEvaluationService>;

export function createEvaluationService(deps: EvaluationServiceDeps) {
  const trust = deps.trust ?? trustNotConfigured;
  const now = deps.now ?? (() => new Date());

  return {
    async createProposal(userId: string, input: CreateProposalInput) {
      const proposal = await deps.proposals.create(userId, input);
      await deps.audit.record({
        userId,
        entityType: "proposal",
        entityId: proposal.id,
        type: "PROPOSAL_CREATED",
        payload: {
          productName: proposal.productName,
          amount: proposal.proposedPrice,
          currency: proposal.currency,
          source: proposal.source,
          proposedFor: proposal.proposedFor,
          sourceEventId: proposal.sourceEventId,
        },
      });
      return proposal;
    },

    /**
     * Runs constraints, Quality Score and merchant trust, applies the
     * decision table, then stores and audits the evaluation and decision.
     * Re-evaluating a proposal records a new evaluation; history is kept.
     */
    async evaluateProposal(
      userId: string,
      proposalId: string,
    ): Promise<ProposalEvaluation> {
      const proposal = await deps.proposals.findById(userId, proposalId);
      if (!proposal) {
        throw new EvaluationError("PROPOSAL_NOT_FOUND", "Proposal not found.");
      }

      // Time windows are checked at the planned purchase time, if any.
      const at = proposal.proposedFor ? new Date(proposal.proposedFor) : now();
      const constraints = await deps.constraints.get(userId);

      // Quality first so KERNEL can visit a Channel3 merchant URL.
      const [constraintCheck, quality] = await Promise.all([
        constraints
          ? (async () => {
              const day = localDayRange(at, constraints.timezone);
              const month = localMonthRange(at, constraints.timezone);
              const [spentToday, spentThisMonth] = await Promise.all([
                constraints.amountCaps.daily === undefined
                  ? 0
                  : deps.payments.sumCommitted(
                      userId,
                      constraints.currency,
                      day.start,
                      day.end,
                    ),
                constraints.amountCaps.monthly === undefined
                  ? 0
                  : deps.payments.sumCommitted(
                      userId,
                      constraints.currency,
                      month.start,
                      month.end,
                    ),
              ]);
              return checkConstraints({
                constraints,
                amount: proposal.proposedPrice,
                currency: proposal.currency,
                at,
                spentToday,
                spentThisMonth,
              });
            })()
          : null,
        deps.quality.score({
          productName: proposal.productName,
          proposedPrice: proposal.proposedPrice,
          currency: proposal.currency,
        }),
      ]);

      const trustResult = await trust.check(proposal, quality.references);
      const trustSignal = trustResult.signal;

      const decision = decide({ constraintCheck, quality, trust: trustSignal });

      const recorded = await deps.evaluations.record({
        userId,
        proposalId: proposal.id,
        quality,
        constraintCheck,
        trustSignal,
        trustEvidence: trustResult.evidence,
        decision,
      });

      await deps.audit.record({
        userId,
        entityType: "evaluation",
        entityId: recorded.evaluation.id,
        type: "EVALUATION_COMPLETED",
        payload: {
          proposalId: proposal.id,
          qualityScore: quality.score,
          explanation: quality.explanation,
          medianPrice: quality.medianPrice,
          offerCount: quality.offerCount,
          constraints: constraintCheck?.constraints ?? null,
          amountCheck: constraintCheck?.amount ?? null,
          trustSignal,
          trustEvidence: trustResult.evidence,
        },
      });
      await deps.audit.record({
        userId,
        entityType: "decision",
        entityId: recorded.decision.id,
        type: "DECISION_RECORDED",
        payload: {
          proposalId: proposal.id,
          evaluationId: recorded.evaluation.id,
          outcome: decision.outcome,
          reason: decision.reason,
          reasonCodes: decision.reasons.map((r) => r.code),
          amount: proposal.proposedPrice,
          currency: proposal.currency,
        },
      });

      return { proposal, ...recorded };
    },
  };
}
