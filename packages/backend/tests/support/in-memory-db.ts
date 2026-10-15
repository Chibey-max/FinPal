import type {
  Decision,
  Evaluation,
  Proposal,
  SpendingConstraints,
} from "@finpal/contracts";

import type { ConstraintsRepository } from "../../src/repositories/constraints-repository";
import type { DecisionRepository } from "../../src/repositories/decision-repository";
import type { EvaluationRepository } from "../../src/repositories/evaluation-repository";
import type { ProposalRepository } from "../../src/repositories/proposal-repository";
import { createInMemoryAudit, createInMemoryPayments } from "./in-memory";

type Owned<T> = T & { userId: string };

/**
 * In-memory stand-in for the Supabase tables, with the same relations:
 * decision -> evaluation -> proposal, and every row owned by a user.
 */
export function createInMemoryDb(clock: () => Date) {
  const proposalRows: Owned<Proposal>[] = [];
  const evaluationRows: Owned<Evaluation>[] = [];
  const decisionRows: Owned<Decision>[] = [];
  const constraintRows = new Map<string, SpendingConstraints>();

  const strip = <T>({ userId: _owner, ...row }: Owned<T>) => row as T;

  const proposals: ProposalRepository = {
    async create(userId, input) {
      const row: Owned<Proposal> = {
        userId,
        id: crypto.randomUUID(),
        productName: input.productName,
        proposedPrice: input.proposedPrice,
        currency: input.currency,
        source: input.source,
        sourceEventId: input.sourceEventId ?? null,
        proposedFor: input.proposedFor ?? null,
        createdAt: clock().toISOString(),
      };
      proposalRows.push(row);
      return strip(row);
    },
    async findById(userId, id) {
      const row = proposalRows.find((r) => r.userId === userId && r.id === id);
      return row ? strip(row) : null;
    },
  };

  const constraints: ConstraintsRepository = {
    async get(userId) {
      return constraintRows.get(userId) ?? null;
    },
    async save(userId, value) {
      constraintRows.set(userId, value);
    },
  };

  const evaluations: EvaluationRepository = {
    async record(input) {
      const at = clock().toISOString();
      const evaluation: Owned<Evaluation> = {
        userId: input.userId,
        id: crypto.randomUUID(),
        proposalId: input.proposalId,
        quality: input.quality,
        constraintCheck: input.constraintCheck,
        trustSignal: input.trustSignal,
        createdAt: at,
      };
      const decision: Owned<Decision> = {
        userId: input.userId,
        id: crypto.randomUUID(),
        evaluationId: evaluation.id,
        ...input.decision,
        decidedAt: at,
      };
      evaluationRows.push(evaluation);
      decisionRows.push(decision);
      return { evaluation: strip(evaluation), decision: strip(decision) };
    },
  };

  const decisions: DecisionRepository = {
    async findForPayment(userId, decisionId) {
      const decision = decisionRows.find(
        (d) => d.userId === userId && d.id === decisionId,
      );
      const evaluation = evaluationRows.find(
        (e) => e.id === decision?.evaluationId,
      );
      const proposal = proposalRows.find(
        (p) => p.id === evaluation?.proposalId,
      );
      if (!decision || !proposal) return null;
      return {
        decisionId: decision.id,
        userId,
        outcome: decision.outcome,
        productName: proposal.productName,
        amount: proposal.proposedPrice,
        currency: proposal.currency,
      };
    },
  };

  return {
    proposals,
    constraints,
    evaluations,
    decisions,
    payments: createInMemoryPayments(clock),
    audit: createInMemoryAudit(),
    rows: { proposalRows, evaluationRows, decisionRows },
  };
}
