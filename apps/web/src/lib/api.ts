import "server-only";

import { EvaluationError, PaymentError } from "@finpal/backend";
import {
  paymentAttemptSchema,
  type PaymentAttempt,
  type PaymentErrorCode,
} from "@finpal/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isMockMode, MOCK_USER, type AppUser } from "@/lib/data-source";
import { getSessionUser } from "@/lib/session";

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/** Verified user for route handlers; the proxy check is only optimistic. */
export async function getApiUser(): Promise<AppUser | null> {
  if (isMockMode()) return MOCK_USER;
  const user = await getSessionUser();
  return user ? { id: user.id, email: user.email } : null;
}

export async function getApiUserId(): Promise<string | null> {
  return (await getApiUser())?.id ?? null;
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
  PAYPAL_AUTH_FAILED: 502,
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

const hits = new Map<string, number[]>();

/**
 * Fixed-window limiter per key, in process memory. Enough to stop one user
 * draining the Groq quota from a single server; not shared across instances.
 */
export function isRateLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export const rateLimited = () =>
  apiError(429, "RATE_LIMITED", "Too many requests. Wait a minute and retry.");
