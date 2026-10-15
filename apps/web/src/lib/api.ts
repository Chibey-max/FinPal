import "server-only";

import { EvaluationError, PaymentError } from "@finpal/backend";
import {
  paymentAttemptSchema,
  type PaymentAttempt,
  type PaymentErrorCode,
} from "@finpal/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/** Verified user id for route handlers; the proxy check is only optimistic. */
export async function getApiUserId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

export const unauthorized = () =>
  apiError(401, "UNAUTHORIZED", "Authentication required.");

export const paymentIdSchema = z.uuid();

/** Strips internal fields (user id, idempotency key) from API responses. */
export function toPaymentResponse(payment: PaymentAttempt) {
  return paymentAttemptSchema.parse(payment);
}

const paymentErrorStatus: Record<PaymentErrorCode, number> = {
  PAYMENT_NOT_FOUND: 404,
  DECISION_NOT_FOUND: 404,
  DECISION_NOT_PAYABLE: 422,
  IDEMPOTENCY_KEY_REUSED: 409,
  DECISION_ALREADY_PAID: 409,
  ORDER_NOT_APPROVED: 409,
  INVALID_TRANSITION: 409,
  CONCURRENT_MODIFICATION: 409,
  PAYPAL_DECLINED: 422,
  PAYPAL_UNAVAILABLE: 503,
};

export function handleRouteError(error: unknown) {
  if (error instanceof EvaluationError) {
    return apiError(404, error.code, error.message);
  }
  if (error instanceof PaymentError) {
    return apiError(
      paymentErrorStatus[error.code],
      error.code,
      error.message,
      error.details,
    );
  }
  if (error instanceof z.ZodError) {
    return apiError(400, "INVALID_REQUEST", "Invalid request.", {
      issues: z.flattenError(error).fieldErrors,
    });
  }
  console.error("Unhandled API error", error);
  return apiError(500, "INTERNAL_ERROR", "Something went wrong.");
}
