import { z } from "zod";

export const paymentStatusSchema = z.enum([
  "CREATED",
  "APPROVED",
  "AUTHORIZED",
  "CAPTURED",
  "VOIDED",
  "REFUNDED",
]);

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

// Client-generated key; retrying a request with the same key never creates a
// second PayPal order. Kept short so derived PayPal-Request-Ids fit 108 chars.
export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, '-' or '_' only.");

export const createPaymentSchema = z.object({
  decisionId: z.uuid(),
  idempotencyKey: idempotencyKeySchema,
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// `status` is FinPal's state machine; the paypal*Status fields are stored
// exactly as PayPal returned them (uppercase), for audit and debugging.
export const paymentAttemptSchema = z.object({
  id: z.uuid(),
  decisionId: z.uuid(),
  status: paymentStatusSchema,
  amount: z.number().positive(),
  currency: z.string().length(3),
  paypalOrderId: z.string(),
  paypalOrderStatus: z.string().nullable(),
  paypalAuthorizationId: z.string().nullable(),
  paypalAuthorizationStatus: z.string().nullable(),
  paypalCaptureId: z.string().nullable(),
  paypalCaptureStatus: z.string().nullable(),
  approveUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PaymentAttempt = z.infer<typeof paymentAttemptSchema>;

export const paymentErrorCodeSchema = z.enum([
  "PAYMENT_NOT_FOUND",
  "DECISION_NOT_FOUND",
  "DECISION_NOT_PAYABLE",
  "IDEMPOTENCY_KEY_REUSED",
  "DECISION_ALREADY_PAID",
  "ORDER_NOT_APPROVED",
  "INVALID_TRANSITION",
  "CONCURRENT_MODIFICATION",
  "PAYPAL_DECLINED",
  "PAYPAL_UNAVAILABLE",
  "PAYPAL_AUTH_FAILED",
]);

export type PaymentErrorCode = z.infer<typeof paymentErrorCodeSchema>;
