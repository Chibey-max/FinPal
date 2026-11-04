import "server-only";

import {
  DuplicatePaymentAttemptError,
  type AuditEventRepository,
  type ConstraintsRepository,
  type DashboardRepository,
  type DecisionRecord,
  type DecisionRepository,
  type EvaluationRepository,
  type PaymentAttemptRecord,
  type PaymentAttemptRepository,
  type ProposalRepository,
} from "@finpal/backend";
import {
  paymentAttemptSchema,
  type Decision,
  type DecisionRow,
  type Evaluation,
  type Proposal,
} from "@finpal/contracts";

import { getStore, now, type Owned } from "./store";

// In-memory implementations of the backend repository interfaces, with the
// same ownership rules as the Supabase ones: every read is scoped by user.

function strip<T>(row: Owned<T>): T {
  const copy: Partial<Owned<T>> = { ...row };
  delete copy.userId;
  return copy as T;
}

export const proposals: ProposalRepository = {
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
      createdAt: now().toISOString(),
    };
    getStore().proposals.push(row);
    return strip(row);
  },
  async findById(userId, id) {
    const row = getStore().proposals.find(
      (r) => r.userId === userId && r.id === id,
    );
    return row ? strip(row) : null;
  },
};

export const constraints: ConstraintsRepository = {
  async get(userId) {
    return getStore().constraints.get(userId) ?? null;
  },
  async save(userId, value) {
    getStore().constraints.set(userId, value);
  },
  async clear(userId) {
    getStore().constraints.delete(userId);
  },
};

export const evaluations: EvaluationRepository = {
  async record(input) {
    const at = now().toISOString();
    const evaluation: Owned<Evaluation> = {
      userId: input.userId,
      id: crypto.randomUUID(),
      proposalId: input.proposalId,
      quality: input.quality,
      constraintCheck: input.constraintCheck,
      trustSignal: input.trustSignal,
      trustEvidence: input.trustEvidence,
      createdAt: at,
    };
    const decision: Owned<Decision> = {
      userId: input.userId,
      id: crypto.randomUUID(),
      evaluationId: evaluation.id,
      ...input.decision,
      decidedAt: at,
      reviewerId: null,
      reviewStatus: null,
      reviewedAt: null,
    };
    getStore().evaluations.push(evaluation);
    getStore().decisions.push(decision);
    return { evaluation: strip(evaluation), decision: strip(decision) };
  },
};

export const payments: PaymentAttemptRepository = {
  async findById(userId, id) {
    return (
      getStore().payments.find((r) => r.userId === userId && r.id === id) ??
      null
    );
  },
  async findByIdempotencyKey(userId, key) {
    return (
      getStore().payments.find(
        (r) => r.userId === userId && r.idempotencyKey === key,
      ) ?? null
    );
  },
  async findByPayPalOrderId(userId, orderId) {
    return (
      getStore().payments.find(
        (r) => r.userId === userId && r.paypalOrderId === orderId,
      ) ?? null
    );
  },
  // Service-role webhook lookups: PayPal ids are globally unique.
  async findAnyByPayPalOrderId(orderId) {
    return getStore().payments.find((r) => r.paypalOrderId === orderId) ?? null;
  },
  async findAnyByPayPalAuthorizationId(authorizationId) {
    return (
      getStore().payments.find(
        (r) => r.paypalAuthorizationId === authorizationId,
      ) ?? null
    );
  },
  async findActiveByDecisionId(userId, decisionId) {
    return (
      getStore().payments.find(
        (r) =>
          r.userId === userId &&
          r.decisionId === decisionId &&
          r.status !== "VOIDED",
      ) ?? null
    );
  },
  async sumCommitted(userId, currency, from, to) {
    const total = getStore()
      .payments.filter(
        (row) =>
          row.userId === userId &&
          row.currency === currency &&
          (row.status === "AUTHORIZED" || row.status === "CAPTURED") &&
          new Date(row.createdAt) >= from &&
          new Date(row.createdAt) < to,
      )
      .reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
    return total / 100;
  },
  async insertMany(attempts) {
    const rows = getStore().payments;
    const clash = attempts.some((attempt) =>
      rows.some(
        (row) =>
          (row.userId === attempt.userId &&
            row.idempotencyKey === attempt.idempotencyKey) ||
          (row.decisionId === attempt.decisionId && row.status !== "VOIDED"),
      ),
    );
    if (clash) throw new DuplicatePaymentAttemptError();
    const at = now().toISOString();
    return attempts.map((attempt) => {
      const record: PaymentAttemptRecord = {
        ...attempt,
        id: crypto.randomUUID(),
        createdAt: at,
        updatedAt: at,
      };
      rows.push(record);
      return record;
    });
  },
  async findByBasketId(userId, basketId) {
    return getStore().payments.filter(
      (row) => row.userId === userId && row.basketId === basketId,
    );
  },
  async updateBasketIfStatus(userId, basketId, expectedStatus, patch) {
    const rows = getStore().payments;
    const at = now().toISOString();
    const moved: PaymentAttemptRecord[] = [];
    rows.forEach((row, index) => {
      if (
        row.userId === userId &&
        row.basketId === basketId &&
        row.status === expectedStatus
      ) {
        rows[index] = { ...row, ...patch, updatedAt: at };
        moved.push(rows[index]!);
      }
    });
    return moved;
  },
  async insert(attempt) {
    const rows = getStore().payments;
    const duplicate = rows.some(
      (row) =>
        (row.userId === attempt.userId &&
          row.idempotencyKey === attempt.idempotencyKey) ||
        (row.decisionId === attempt.decisionId && row.status !== "VOIDED"),
    );
    if (duplicate) throw new DuplicatePaymentAttemptError();
    const at = now().toISOString();
    const record: PaymentAttemptRecord = {
      ...attempt,
      id: crypto.randomUUID(),
      createdAt: at,
      updatedAt: at,
    };
    rows.push(record);
    return record;
  },
  async updateIfStatus(id, expectedStatus, patch) {
    const rows = getStore().payments;
    const index = rows.findIndex(
      (row) => row.id === id && row.status === expectedStatus,
    );
    if (index === -1) return null;
    rows[index] = {
      ...rows[index]!,
      ...patch,
      updatedAt: now().toISOString(),
    };
    return rows[index]!;
  },
};

function findOwnedDecision(userId: string, decisionId: string) {
  return getStore().decisions.find(
    (d) => d.userId === userId && d.id === decisionId,
  );
}

export const decisions: DecisionRepository = {
  async findById(userId, decisionId) {
    const decision = findOwnedDecision(userId, decisionId);
    return decision ? strip(decision) : null;
  },
  async findForPayment(userId, decisionId) {
    const store = getStore();
    const decision = findOwnedDecision(userId, decisionId);
    if (!decision) return null;
    const evaluation = store.evaluations.find(
      (e) => e.id === decision.evaluationId,
    )!;
    const proposal = store.proposals.find(
      (p) => p.id === evaluation.proposalId,
    )!;
    return {
      decisionId,
      userId,
      outcome: decision.outcome,
      reviewStatus: decision.reviewStatus,
      productName: proposal.productName,
      amount: proposal.proposedPrice,
      currency: proposal.currency,
    };
  },
  // Compare-and-set like the Supabase repository: only while unreviewed.
  async setReview(userId, decisionId, patch) {
    const decision = findOwnedDecision(userId, decisionId);
    if (!decision || decision.reviewStatus !== null) return null;
    Object.assign(decision, patch);
    return strip(decision);
  },
};

function latestPayment(userId: string, decisionId: string) {
  return (
    getStore()
      .payments.filter(
        (p) => p.userId === userId && p.decisionId === decisionId,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  );
}

function joinDecision(userId: string, decisionId: string) {
  const store = getStore();
  const decision = store.decisions.find(
    (d) => d.userId === userId && d.id === decisionId,
  );
  if (!decision) return null;
  const evaluation = store.evaluations.find(
    (e) => e.id === decision.evaluationId,
  );
  const proposal = evaluation
    ? store.proposals.find((p) => p.id === evaluation.proposalId)
    : undefined;
  if (!evaluation || !proposal) return null;
  return { decision, evaluation, proposal };
}

export const dashboard: DashboardRepository = {
  async listDecisionRows(userId, query) {
    return getStore()
      .decisions.filter((d) => d.userId === userId)
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
      .slice(0, query.limit)
      .flatMap((d): DecisionRow[] => {
        const joined = joinDecision(userId, d.id);
        if (!joined) return [];
        const { decision, evaluation, proposal } = joined;
        const payment = latestPayment(userId, decision.id);
        return [
          {
            decisionId: decision.id,
            decidedAt: decision.decidedAt,
            outcome: decision.outcome,
            reason: decision.reason,
            reasonCodes: decision.reasons.map((r) => r.code),
            proposalId: proposal.id,
            productName: proposal.productName,
            amount: proposal.proposedPrice,
            currency: proposal.currency,
            source: proposal.source,
            proposalCreatedAt: proposal.createdAt,
            evaluationId: evaluation.id,
            qualityScore: evaluation.quality.score,
            qualityExplanation: evaluation.quality.explanation,
            medianPrice: evaluation.quality.medianPrice,
            offerCount: evaluation.quality.offerCount,
            trustSignal: evaluation.trustSignal,
            reviewStatus: decision.reviewStatus,
            paymentId: payment?.id ?? null,
            paymentStatus: payment?.status ?? null,
            paymentUpdatedAt: payment?.updatedAt ?? null,
          },
        ];
      });
  },
  async getDecision(userId, decisionId): Promise<DecisionRecord | null> {
    const joined = joinDecision(userId, decisionId);
    if (!joined) return null;
    const payment = latestPayment(userId, decisionId);
    return {
      proposal: strip(joined.proposal),
      evaluation: strip(joined.evaluation),
      decision: strip(joined.decision),
      payment: payment ? paymentAttemptSchema.parse(payment) : null,
    };
  },
};

export const auditEvents: AuditEventRepository = {
  async append(event) {
    const store = getStore();
    store.audit.push({
      ...event,
      id: store.audit.length + 1,
      createdAt: now().toISOString(),
    });
  },
  async list(userId, query) {
    return getStore()
      .audit.filter(
        (event) =>
          event.userId === userId &&
          (query.before === undefined || event.id < query.before) &&
          (!query.entityType || event.entityType === query.entityType) &&
          (!query.entityId || event.entityId === query.entityId),
      )
      .slice()
      .reverse()
      .slice(0, query.limit)
      .map((event) => strip(event));
  },
};
