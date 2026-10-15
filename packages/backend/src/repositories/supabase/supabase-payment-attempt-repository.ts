import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { paymentStatusSchema } from "@finpal/contracts";

import {
  DuplicatePaymentAttemptError,
  type PaymentAttemptPatch,
  type PaymentAttemptRecord,
  type PaymentAttemptRepository,
} from "../payment-attempt-repository";

const UNIQUE_VIOLATION = "23505";

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

function toRecord(row: unknown): PaymentAttemptRecord {
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

export function createSupabasePaymentAttemptRepository(
  db: SupabaseClient,
): PaymentAttemptRepository {
  const table = () => db.from("payment_attempts");

  async function findOne(userId: string, column: string, value: string) {
    const { data, error } = await table()
      .select("*")
      .eq("user_id", userId)
      .eq(column, value)
      .maybeSingle();
    if (error) throw error;
    return data ? toRecord(data) : null;
  }

  return {
    findById: (userId, id) => findOne(userId, "id", id),
    findByIdempotencyKey: (userId, key) =>
      findOne(userId, "idempotency_key", key),
    findByPayPalOrderId: (userId, orderId) =>
      findOne(userId, "paypal_order_id", orderId),

    async findActiveByDecisionId(userId, decisionId) {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", userId)
        .eq("decision_id", decisionId)
        .neq("status", "VOIDED")
        .maybeSingle();
      if (error) throw error;
      return data ? toRecord(data) : null;
    },

    async insert(attempt) {
      const { data, error } = await table()
        .insert({
          user_id: attempt.userId,
          decision_id: attempt.decisionId,
          status: attempt.status,
          amount: attempt.amount,
          currency: attempt.currency,
          idempotency_key: attempt.idempotencyKey,
          paypal_order_id: attempt.paypalOrderId,
          paypal_order_status: attempt.paypalOrderStatus,
          paypal_authorization_id: attempt.paypalAuthorizationId,
          paypal_authorization_status: attempt.paypalAuthorizationStatus,
          paypal_capture_id: attempt.paypalCaptureId,
          paypal_capture_status: attempt.paypalCaptureStatus,
          approve_url: attempt.approveUrl,
        })
        .select("*")
        .single();
      if (error?.code === UNIQUE_VIOLATION) {
        throw new DuplicatePaymentAttemptError();
      }
      if (error) throw error;
      return toRecord(data);
    },

    async updateIfStatus(id, expectedStatus, patch) {
      const { data, error } = await table()
        .update(toColumns(patch))
        .eq("id", id)
        .eq("status", expectedStatus)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data ? toRecord(data) : null;
    },
  };
}
