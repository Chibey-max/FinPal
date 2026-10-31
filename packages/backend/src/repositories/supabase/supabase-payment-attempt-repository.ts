import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { paymentStatusSchema } from "@finpal/contracts";

import {
  DuplicatePaymentAttemptError,
  type NewPaymentAttempt,
  type PaymentAttemptPatch,
  type PaymentAttemptRecord,
  type PaymentAttemptRepository,
} from "../payment-attempt-repository";

const UNIQUE_VIOLATION = "23505";

const rowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  decision_id: z.string(),
  // Optional so reads keep working until the baskets migration is applied.
  basket_id: z.string().nullish(),
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
    basketId: r.basket_id ?? null,
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

function toInsert(attempt: NewPaymentAttempt) {
  return {
    user_id: attempt.userId,
    decision_id: attempt.decisionId,
    // Left out for single payments so they work before the baskets migration.
    ...(attempt.basketId ? { basket_id: attempt.basketId } : {}),
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
  };
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
    return data ? toPaymentAttemptRecord(data) : null;
  }

  return {
    findById: (userId, id) => findOne(userId, "id", id),
    findByIdempotencyKey: (userId, key) =>
      findOne(userId, "idempotency_key", key),

    async findByPayPalOrderId(userId, orderId) {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", userId)
        .eq("paypal_order_id", orderId)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toPaymentAttemptRecord(data) : null;
    },

    async findByBasketId(userId, basketId) {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", userId)
        .eq("basket_id", basketId)
        .order("idempotency_key");
      if (error) throw error;
      return (data ?? []).map(toPaymentAttemptRecord);
    },

    async findAnyByPayPalOrderId(paypalOrderId) {
      const { data, error } = await table()
        .select("*")
        .eq("paypal_order_id", paypalOrderId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toPaymentAttemptRecord(data) : null;
    },

    async findAnyByPayPalAuthorizationId(paypalAuthorizationId) {
      const { data, error } = await table()
        .select("*")
        .eq("paypal_authorization_id", paypalAuthorizationId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toPaymentAttemptRecord(data) : null;
    },

    async findActiveByDecisionId(userId, decisionId) {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", userId)
        .eq("decision_id", decisionId)
        .neq("status", "VOIDED")
        .maybeSingle();
      if (error) throw error;
      return data ? toPaymentAttemptRecord(data) : null;
    },

    async sumCommitted(userId, currency, from, to) {
      const { data, error } = await table()
        .select("amount")
        .eq("user_id", userId)
        .eq("currency", currency)
        .in("status", ["AUTHORIZED", "CAPTURED"])
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString());
      if (error) throw error;
      // Sum in cents to avoid floating-point drift across many payments.
      const cents = (data ?? []).reduce(
        (total, row) => total + Math.round(Number(row.amount) * 100),
        0,
      );
      return cents / 100;
    },

    async insertMany(attempts) {
      const { data, error } = await table()
        .insert(attempts.map(toInsert))
        .select("*");
      if (error?.code === UNIQUE_VIOLATION) {
        throw new DuplicatePaymentAttemptError();
      }
      if (error) throw error;
      return (data ?? []).map(toPaymentAttemptRecord);
    },

    async updateBasketIfStatus(userId, basketId, expectedStatus, patch) {
      const { data, error } = await table()
        .update(toColumns(patch))
        .eq("user_id", userId)
        .eq("basket_id", basketId)
        .eq("status", expectedStatus)
        .select("*");
      if (error) throw error;
      return (data ?? []).map(toPaymentAttemptRecord);
    },

    async insert(attempt) {
      const { data, error } = await table()
        .insert(toInsert(attempt))
        .select("*")
        .single();
      if (error?.code === UNIQUE_VIOLATION) {
        throw new DuplicatePaymentAttemptError();
      }
      if (error) throw error;
      return toPaymentAttemptRecord(data);
    },

    async updateIfStatus(id, expectedStatus, patch) {
      const { data, error } = await table()
        .update(toColumns(patch))
        .eq("id", id)
        .eq("status", expectedStatus)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data ? toPaymentAttemptRecord(data) : null;
    },
  };
}
