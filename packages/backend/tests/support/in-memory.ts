import type { PaymentStatus } from "@finpal/contracts";

import type {
  AuditEventInput,
  AuditEventRepository,
} from "../../src/repositories/audit-event-repository";
import { createAuditLog } from "../../src/services/audit-log";
import type { PayableDecision } from "../../src/repositories/decision-repository";
import {
  DuplicatePaymentAttemptError,
  type PaymentAttemptPatch,
  type PaymentAttemptRecord,
  type PaymentAttemptRepository,
} from "../../src/repositories/payment-attempt-repository";
import {
  PayPalApiError,
  type PayPalClient,
} from "../../src/integrations/paypal/paypal-client";

export function createInMemoryPayments(): PaymentAttemptRepository & {
  rows: PaymentAttemptRecord[];
} {
  const rows: PaymentAttemptRecord[] = [];
  let sequence = 0;
  const find = (predicate: (row: PaymentAttemptRecord) => boolean) =>
    Promise.resolve(rows.find(predicate) ?? null);

  return {
    rows,
    findById: (userId, id) =>
      find((row) => row.userId === userId && row.id === id),
    findByIdempotencyKey: (userId, key) =>
      find((row) => row.userId === userId && row.idempotencyKey === key),
    findByPayPalOrderId: (userId, orderId) =>
      find((row) => row.userId === userId && row.paypalOrderId === orderId),
    findActiveByDecisionId: (userId, decisionId) =>
      find(
        (row) =>
          row.userId === userId &&
          row.decisionId === decisionId &&
          row.status !== "VOIDED",
      ),
    async insert(attempt) {
      const duplicate = rows.some(
        (row) =>
          row.idempotencyKey === attempt.idempotencyKey ||
          (row.decisionId === attempt.decisionId && row.status !== "VOIDED"),
      );
      if (duplicate) throw new DuplicatePaymentAttemptError();
      sequence += 1;
      const now = new Date().toISOString();
      const record: PaymentAttemptRecord = {
        ...attempt,
        id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(record);
      return record;
    },
    async updateIfStatus(
      id: string,
      expectedStatus: PaymentStatus,
      patch: PaymentAttemptPatch,
    ) {
      const index = rows.findIndex(
        (row) => row.id === id && row.status === expectedStatus,
      );
      if (index === -1) return null;
      rows[index] = { ...rows[index]!, ...patch };
      return rows[index]!;
    },
  };
}

/** Simulates PayPal Sandbox, including PayPal-Request-Id replay. */
export function createFakePayPal() {
  const orders = new Map<
    string,
    { status: string; authorizationId?: string }
  >();
  const replays = new Map<string, unknown>();
  const calls: string[] = [];
  let failNext: PayPalApiError | undefined;
  let sequence = 0;

  async function idempotent<T>(requestId: string, run: () => T): Promise<T> {
    if (failNext) {
      const error = failNext;
      failNext = undefined;
      throw error;
    }
    if (replays.has(requestId)) return replays.get(requestId) as T;
    const result = run();
    replays.set(requestId, result);
    return result;
  }

  const client: PayPalClient = {
    createOrder: (input) => {
      calls.push("createOrder");
      return idempotent(input.requestId, () => {
        sequence += 1;
        const orderId = `ORDER-${sequence}`;
        orders.set(orderId, { status: "PAYER_ACTION_REQUIRED" });
        return {
          orderId,
          status: "PAYER_ACTION_REQUIRED",
          approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
        };
      });
    },
    getOrder: async (orderId) => {
      calls.push("getOrder");
      const order = orders.get(orderId)!;
      return { orderId, status: order.status, approveUrl: null };
    },
    authorizeOrder: (orderId, requestId) => {
      calls.push("authorizeOrder");
      return idempotent(requestId, () => {
        const order = orders.get(orderId)!;
        if (order.status !== "APPROVED") {
          throw new PayPalApiError("Not approved", 422, "ORDER_NOT_APPROVED");
        }
        order.status = "COMPLETED";
        order.authorizationId = `AUTH-${orderId}`;
        return {
          orderStatus: "COMPLETED",
          authorizationId: order.authorizationId,
          authorizationStatus: "CREATED",
        };
      });
    },
    captureAuthorization: (authorizationId, requestId) => {
      calls.push("captureAuthorization");
      return idempotent(requestId, () => ({
        captureId: `CAPTURE-${authorizationId}`,
        captureStatus: "COMPLETED",
      }));
    },
    voidAuthorization: (_authorizationId, requestId) => {
      calls.push("voidAuthorization");
      return idempotent(requestId, () => ({ authorizationStatus: "VOIDED" }));
    },
  };

  return {
    client,
    calls,
    /** Simulates the buyer clicking "Continue" in PayPal checkout. */
    buyerApproves(orderId: string) {
      orders.get(orderId)!.status = "APPROVED";
    },
    failNextCall(error: PayPalApiError) {
      failNext = error;
    },
  };
}

/** In-memory audit storage plus the real AuditLog on top of it. */
export function createInMemoryAudit() {
  const events: (AuditEventInput & { id: number })[] = [];
  const repository: AuditEventRepository = {
    async append(event) {
      events.push({ ...event, id: events.length + 1 });
    },
    async list(userId, query) {
      return events
        .filter(
          (event) =>
            event.userId === userId &&
            (query.before === undefined || event.id < query.before) &&
            (!query.entityType || event.entityType === query.entityType) &&
            (!query.entityId || event.entityId === query.entityId),
        )
        .reverse()
        .slice(0, query.limit)
        .map(({ id, entityType, entityId, type, payload }) => ({
          id,
          entityType,
          entityId,
          type,
          payload,
          createdAt: new Date(Date.UTC(2026, 9, 18, 0, 0, id)).toISOString(),
        }));
    },
  };
  return {
    events,
    repository,
    log: createAuditLog(repository),
    types: () => events.map((event) => event.type),
  };
}

export function createInMemoryDecisions(decisions: PayableDecision[]) {
  return {
    async findForPayment(userId: string, decisionId: string) {
      return (
        decisions.find(
          (decision) =>
            decision.userId === userId && decision.decisionId === decisionId,
        ) ?? null
      );
    },
  };
}
