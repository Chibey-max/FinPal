import type { PaymentAttempt, PaymentStatus } from "@finpal/contracts";

export interface PaymentAttemptRecord extends PaymentAttempt {
  userId: string;
  idempotencyKey: string;
}

export type NewPaymentAttempt = Omit<
  PaymentAttemptRecord,
  "id" | "createdAt" | "updatedAt"
>;

export type PaymentAttemptPatch = Partial<
  Pick<
    PaymentAttemptRecord,
    | "status"
    | "paypalOrderStatus"
    | "paypalAuthorizationId"
    | "paypalAuthorizationStatus"
    | "paypalCaptureId"
    | "paypalCaptureStatus"
  >
>;

/** Thrown by insert() when the idempotency key or decision is already used. */
export class DuplicatePaymentAttemptError extends Error {
  constructor() {
    super("A payment attempt already exists for this key or decision.");
    this.name = "DuplicatePaymentAttemptError";
  }
}

// Every finder is scoped by userId: the backend uses the service role, which
// bypasses RLS, so ownership must be enforced here.
export interface PaymentAttemptRepository {
  findById(userId: string, id: string): Promise<PaymentAttemptRecord | null>;
  findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<PaymentAttemptRecord | null>;
  findByPayPalOrderId(
    userId: string,
    paypalOrderId: string,
  ): Promise<PaymentAttemptRecord | null>;
  /** The decision's payment that is not VOIDED, if any (at most one exists). */
  findActiveByDecisionId(
    userId: string,
    decisionId: string,
  ): Promise<PaymentAttemptRecord | null>;
  insert(attempt: NewPaymentAttempt): Promise<PaymentAttemptRecord>;
  /**
   * Compare-and-set: applies the patch only while the row is still in
   * `expectedStatus`. Returns null if another request changed it first.
   */
  updateIfStatus(
    id: string,
    expectedStatus: PaymentStatus,
    patch: PaymentAttemptPatch,
  ): Promise<PaymentAttemptRecord | null>;
}
