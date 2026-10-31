import { z } from "zod";

import { paymentStatusSchema } from "@finpal/contracts";

import {
  DuplicatePaymentAttemptError,
  type PaymentAttemptPatch,
  type PaymentAttemptRecord,
  type PaymentAttemptRepository,
} from "../payment-attempt-repository";
import { isUniqueViolation, queryRow, type Db } from "./db";

const rowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  decision_id: z.string(),
  status: paymentStatusSchema,
  amount: z.coerce.number(),
  currency: z.string(),
  idempotency_key: z.string(),
  paypal_order_id: z.string(),
  paypal_order_status: z.string().nullable(),
  paypal_authorization_id: z.string().nullable(),
  paypal_authorization_status: z.string().nullable(),
  paypal_capture_id: z.string().nullable(),
  paypal_capture_status: z.string().nullable(),
  approve_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export function toPaymentAttemptRecord(row: unknown): PaymentAttemptRecord {
  const r = rowSchema.parse(row);
  return {
    id: r.id,
    userId: r.user_id,
    decisionId: r.decision_id,
    status: r.status,
    amount: r.amount,
    currency: r.currency,
    idempotencyKey: r.idempotency_key,
    paypalOrderId: r.paypal_order_id,
    paypalOrderStatus: r.paypal_order_status,
    paypalAuthorizationId: r.paypal_authorization_id,
    paypalAuthorizationStatus: r.paypal_authorization_status,
    paypalCaptureId: r.paypal_capture_id,
    paypalCaptureStatus: r.paypal_capture_status,
    approveUrl: r.approve_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toColumns(patch: PaymentAttemptPatch) {
  const columns: Record<string, unknown> = {};
  if (patch.status !== undefined) columns.status = patch.status;
  if (patch.paypalOrderStatus !== undefined)
    columns.paypal_order_status = patch.paypalOrderStatus;
  if (patch.paypalAuthorizationId !== undefined)
    columns.paypal_authorization_id = patch.paypalAuthorizationId;
  if (patch.paypalAuthorizationStatus !== undefined)
    columns.paypal_authorization_status = patch.paypalAuthorizationStatus;
  if (patch.paypalCaptureId !== undefined)
    columns.paypal_capture_id = patch.paypalCaptureId;
  if (patch.paypalCaptureStatus !== undefined)
    columns.paypal_capture_status = patch.paypalCaptureStatus;
  return columns;
}

export function createPostgresPaymentAttemptRepository(
  db: Db,
): PaymentAttemptRepository {
  async function findOne(where: string, values: unknown[]) {
    const row = await queryRow(
      db,
      `select to_jsonb(pa) as row from public.payment_attempts pa where ${where}`,
      values,
    );
    return row ? toPaymentAttemptRecord(row) : null;
  }

  return {
    findById: (userId, id) => findOne("user_id = $1 and id = $2", [userId, id]),
    findByIdempotencyKey: (userId, key) =>
      findOne("user_id = $1 and idempotency_key = $2", [userId, key]),
    findByPayPalOrderId: (userId, orderId) =>
      findOne("user_id = $1 and paypal_order_id = $2", [userId, orderId]),
    findAnyByPayPalOrderId: (paypalOrderId) =>
      findOne("paypal_order_id = $1", [paypalOrderId]),
    findAnyByPayPalAuthorizationId: (paypalAuthorizationId) =>
      findOne("paypal_authorization_id = $1", [paypalAuthorizationId]),
    findActiveByDecisionId: (userId, decisionId) =>
      findOne("user_id = $1 and decision_id = $2 and status <> 'VOIDED'", [
        userId,
        decisionId,
      ]),

    async sumCommitted(userId, currency, from, to) {
      // Summed as numeric in the database: exact, no floating-point drift.
      const { rows } = await db.query<{ total: string }>(
        `select coalesce(sum(amount), 0)::text as total
         from public.payment_attempts
         where user_id = $1 and currency = $2
           and status in ('AUTHORIZED', 'CAPTURED')
           and created_at >= $3 and created_at < $4`,
        [userId, currency, from.toISOString(), to.toISOString()],
      );
      return Number(rows[0]?.total ?? 0);
    },

    async insert(attempt) {
      try {
        const row = await queryRow(
          db,
          `insert into public.payment_attempts (
             user_id, decision_id, status, amount, currency, idempotency_key,
             paypal_order_id, paypal_order_status, paypal_authorization_id,
             paypal_authorization_status, paypal_capture_id,
             paypal_capture_status, approve_url
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           returning to_jsonb(payment_attempts) as row`,
          [
            attempt.userId,
            attempt.decisionId,
            attempt.status,
            attempt.amount,
            attempt.currency,
            attempt.idempotencyKey,
            attempt.paypalOrderId,
            attempt.paypalOrderStatus,
            attempt.paypalAuthorizationId,
            attempt.paypalAuthorizationStatus,
            attempt.paypalCaptureId,
            attempt.paypalCaptureStatus,
            attempt.approveUrl,
          ],
        );
        return toPaymentAttemptRecord(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new DuplicatePaymentAttemptError();
        throw error;
      }
    },

    async updateIfStatus(id, expectedStatus, patch) {
      // Column names come from toColumns' fixed keys, never from input.
      const columns = Object.entries(toColumns(patch));
      const assignments = columns.length
        ? columns.map(([column], i) => `${column} = $${i + 3}`).join(", ")
        : "status = status";
      const row = await queryRow(
        db,
        `update public.payment_attempts pa set ${assignments}
         where id = $1 and status = $2
         returning to_jsonb(pa) as row`,
        [id, expectedStatus, ...columns.map(([, value]) => value)],
      );
      return row ? toPaymentAttemptRecord(row) : null;
    },
  };
}
