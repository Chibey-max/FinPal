import type {
  AuditEntityType,
  AuditEventType,
  PaymentStatus,
} from "@finpal/contracts";

import { PaymentError } from "../domain/payment-errors";
import { canTransitionPayment } from "../domain/payment-state-machine";
import {
  PayPalApiError,
  type PayPalClient,
} from "../integrations/paypal/paypal-client";
import type { AuditLog } from "../services/audit-log";
import type { DecisionRepository } from "../repositories/decision-repository";
import {
  DuplicatePaymentAttemptError,
  type PaymentAttemptPatch,
  type PaymentAttemptRecord,
  type PaymentAttemptRepository,
} from "../repositories/payment-attempt-repository";

export interface PaymentServiceDeps {
  paypal: PayPalClient;
  payments: PaymentAttemptRepository;
  decisions: DecisionRepository;
  audit: Pick<AuditLog, "record">;
  /** Where PayPal sends the buyer after approving; PayPal appends ?token=<orderId>. */
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatePaymentOrderInput {
  userId: string;
  decisionId: string;
  idempotencyKey: string;
}

export type PaymentService = ReturnType<typeof createPaymentService>;

// PayPal order statuses meaning the buyer has approved. COMPLETED covers a
// retry after we authorized at PayPal but crashed before saving the result.
const approvedOrderStatuses = new Set(["APPROVED", "COMPLETED"]);
const deniedAuthorizationStatuses = new Set(["DENIED", "VOIDED", "EXPIRED"]);
const failedCaptureStatuses = new Set(["DECLINED", "FAILED"]);

export function createPaymentService(deps: PaymentServiceDeps) {
  const { paypal, payments, decisions, audit } = deps;

  async function record(
    payment: Pick<PaymentAttemptRecord, "id" | "userId">,
    type: AuditEventType,
    payload: Record<string, unknown>,
  ) {
    await audit.record({
      userId: payment.userId,
      entityType: "payment_attempt",
      entityId: payment.id,
      type,
      payload,
    });
  }

  // Calls PayPal, audits any failure, and maps it to a PaymentError.
  async function callPayPal<T>(
    operation: string,
    entity: { userId: string; entityType: AuditEntityType; entityId: string },
    call: () => Promise<T>,
  ): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof PayPalApiError)) throw error;

      await audit
        .record({
          ...entity,
          type: "PAYPAL_CALL_FAILED",
          payload: {
            operation,
            httpStatus: error.status,
            issue: error.issue ?? null,
            debugId: error.debugId ?? null,
          },
        })
        .catch(() => undefined); // Never mask the PayPal error with an audit error.

      const details = { operation, issue: error.issue, debugId: error.debugId };
      if (error.issue === "ORDER_NOT_APPROVED") {
        throw new PaymentError(
          "ORDER_NOT_APPROVED",
          "The buyer has not approved this order in PayPal yet.",
          details,
        );
      }
      if (error.status === 0 || error.status === 429 || error.status >= 500) {
        throw new PaymentError(
          "PAYPAL_UNAVAILABLE",
          "PayPal is unavailable. It is safe to retry.",
          details,
        );
      }
      // FinPal's own merchant credentials were rejected: a configuration
      // problem, not a decline of the buyer's payment.
      if (error.status === 401 || error.status === 403) {
        throw new PaymentError(
          "PAYPAL_AUTH_FAILED",
          "PayPal rejected FinPal's merchant credentials. Check the Sandbox client ID and secret.",
          details,
        );
      }
      throw new PaymentError(
        "PAYPAL_DECLINED",
        `PayPal rejected the ${operation} request.`,
        details,
      );
    }
  }

  async function getOwned(userId: string, paymentId: string) {
    const payment = await payments.findById(userId, paymentId);
    if (!payment) {
      throw new PaymentError("PAYMENT_NOT_FOUND", "Payment not found.");
    }
    return payment;
  }

  function invalidTransition(payment: PaymentAttemptRecord, to: PaymentStatus) {
    const message =
      to === "VOIDED" && payment.status === "CAPTURED"
        ? "A captured payment cannot be voided; reversing it requires a refund."
        : `Cannot move a payment from ${payment.status} to ${to}.`;
    return new PaymentError("INVALID_TRANSITION", message, {
      from: payment.status,
      to,
    });
  }

  // Applies a state change with compare-and-set. Returns `changed: false`
  // when a concurrent request already made the same change, so callers emit
  // exactly one audit event per real transition.
  async function transition(
    payment: PaymentAttemptRecord,
    to: PaymentStatus,
    patch: PaymentAttemptPatch,
  ): Promise<{ payment: PaymentAttemptRecord; changed: boolean }> {
    if (!canTransitionPayment(payment.status, to)) {
      throw invalidTransition(payment, to);
    }
    const updated = await payments.updateIfStatus(payment.id, payment.status, {
      ...patch,
      status: to,
    });
    if (updated) return { payment: updated, changed: true };

    const current = await getOwned(payment.userId, payment.id);
    if (current.status === to) return { payment: current, changed: false };
    throw new PaymentError(
      "CONCURRENT_MODIFICATION",
      "The payment was changed by another request. Reload and retry.",
      { expected: payment.status, actual: current.status },
    );
  }

  async function approve(payment: PaymentAttemptRecord) {
    const order = await callPayPal(
      "getOrder",
      {
        userId: payment.userId,
        entityType: "payment_attempt",
        entityId: payment.id,
      },
      () => paypal.getOrder(payment.paypalOrderId),
    );
    if (!approvedOrderStatuses.has(order.status)) {
      throw new PaymentError(
        "ORDER_NOT_APPROVED",
        "The buyer has not approved this order in PayPal yet.",
        { paypalOrderStatus: order.status },
      );
    }
    const result = await transition(payment, "APPROVED", {
      paypalOrderStatus: order.status,
    });
    if (result.changed) {
      await record(result.payment, "PAYMENT_APPROVED", {
        paypalOrderId: payment.paypalOrderId,
        paypalOrderStatus: order.status,
      });
    }
    return result.payment;
  }

  async function authorizeApproved(payment: PaymentAttemptRecord) {
    const authorization = await callPayPal(
      "authorizeOrder",
      {
        userId: payment.userId,
        entityType: "payment_attempt",
        entityId: payment.id,
      },
      () =>
        paypal.authorizeOrder(payment.paypalOrderId, `authorize-${payment.id}`),
    );
    if (deniedAuthorizationStatuses.has(authorization.authorizationStatus)) {
      throw new PaymentError(
        "PAYPAL_DECLINED",
        "PayPal did not authorize this payment.",
        { paypalAuthorizationStatus: authorization.authorizationStatus },
      );
    }
    const result = await transition(payment, "AUTHORIZED", {
      paypalOrderStatus: authorization.orderStatus,
      paypalAuthorizationId: authorization.authorizationId,
      paypalAuthorizationStatus: authorization.authorizationStatus,
    });
    if (result.changed) {
      await record(result.payment, "PAYMENT_AUTHORIZED", {
        paypalAuthorizationId: authorization.authorizationId,
        paypalAuthorizationStatus: authorization.authorizationStatus,
        amount: payment.amount,
        currency: payment.currency,
      });
    }
    return result.payment;
  }

  async function authorize(payment: PaymentAttemptRecord) {
    if (payment.status === "AUTHORIZED" || payment.status === "CAPTURED") {
      return payment;
    }
    let current = payment;
    if (current.status === "CREATED") current = await approve(current);
    if (current.status === "APPROVED") return authorizeApproved(current);
    throw invalidTransition(current, "AUTHORIZED");
  }

  return {
    async getPayment(userId: string, paymentId: string) {
      return getOwned(userId, paymentId);
    },

    /** Creates the PayPal order (CREATED). Retrying with the same key is safe. */
    async createPaymentOrder(input: CreatePaymentOrderInput) {
      const { userId, decisionId, idempotencyKey } = input;

      const existing = await payments.findByIdempotencyKey(
        userId,
        idempotencyKey,
      );
      if (existing) {
        if (existing.decisionId !== decisionId) {
          throw new PaymentError(
            "IDEMPOTENCY_KEY_REUSED",
            "This idempotency key was already used for a different decision.",
          );
        }
        return existing;
      }

      const decision = await decisions.findForPayment(userId, decisionId);
      if (!decision) {
        throw new PaymentError("DECISION_NOT_FOUND", "Decision not found.");
      }
      // MANUAL_REVIEW becomes payable once reviewer approval exists (Day 14).
      if (decision.outcome !== "AUTO_APPROVE") {
        throw new PaymentError(
          "DECISION_NOT_PAYABLE",
          `A ${decision.outcome} decision cannot be paid.`,
          { outcome: decision.outcome },
        );
      }
      if (await payments.findActiveByDecisionId(userId, decisionId)) {
        throw new PaymentError(
          "DECISION_ALREADY_PAID",
          "This decision already has an active payment.",
        );
      }

      const order = await callPayPal(
        "createOrder",
        { userId, entityType: "decision", entityId: decisionId },
        () =>
          paypal.createOrder({
            amount: decision.amount,
            currency: decision.currency,
            description: decision.productName,
            // Scoped by user so two users' keys can never share a PayPal order.
            requestId: `order-${userId}-${idempotencyKey}`,
            returnUrl: deps.returnUrl,
            cancelUrl: deps.cancelUrl,
          }),
      );

      let payment: PaymentAttemptRecord;
      try {
        payment = await payments.insert({
          userId,
          decisionId,
          idempotencyKey,
          status: "CREATED",
          amount: decision.amount,
          currency: decision.currency,
          paypalOrderId: order.orderId,
          paypalOrderStatus: order.status,
          paypalAuthorizationId: null,
          paypalAuthorizationStatus: null,
          paypalCaptureId: null,
          paypalCaptureStatus: null,
          approveUrl: order.approveUrl,
        });
      } catch (error) {
        if (!(error instanceof DuplicatePaymentAttemptError)) throw error;
        // A concurrent retry with the same key won the insert.
        const winner = await payments.findByIdempotencyKey(
          userId,
          idempotencyKey,
        );
        if (winner?.decisionId === decisionId) return winner;
        throw new PaymentError(
          "DECISION_ALREADY_PAID",
          "This decision already has an active payment.",
        );
      }

      await record(payment, "PAYMENT_CREATED", {
        decisionId,
        paypalOrderId: order.orderId,
        paypalOrderStatus: order.status,
        amount: payment.amount,
        currency: payment.currency,
      });
      return payment;
    },

    /** CREATED -> APPROVED -> AUTHORIZED. Idempotent once authorized. */
    async authorizePayment(userId: string, paymentId: string) {
      return authorize(await getOwned(userId, paymentId));
    },

    /** Entry point for PayPal's return redirect, which only carries the order id. */
    async completeApproval(userId: string, paypalOrderId: string) {
      const payment = await payments.findByPayPalOrderId(userId, paypalOrderId);
      if (!payment) {
        throw new PaymentError("PAYMENT_NOT_FOUND", "Payment not found.");
      }
      return authorize(payment);
    },

    /** AUTHORIZED -> CAPTURED. Idempotent once captured. */
    async capturePayment(userId: string, paymentId: string) {
      const payment = await getOwned(userId, paymentId);
      if (payment.status === "CAPTURED") return payment;
      if (payment.status !== "AUTHORIZED" || !payment.paypalAuthorizationId) {
        throw invalidTransition(payment, "CAPTURED");
      }
      const authorizationId = payment.paypalAuthorizationId;

      const capture = await callPayPal(
        "captureAuthorization",
        { userId, entityType: "payment_attempt", entityId: payment.id },
        () =>
          paypal.captureAuthorization(authorizationId, `capture-${payment.id}`),
      );
      if (failedCaptureStatuses.has(capture.captureStatus)) {
        throw new PaymentError(
          "PAYPAL_DECLINED",
          "PayPal declined the capture.",
          {
            paypalCaptureStatus: capture.captureStatus,
          },
        );
      }

      const result = await transition(payment, "CAPTURED", {
        paypalCaptureId: capture.captureId,
        paypalCaptureStatus: capture.captureStatus,
        paypalAuthorizationStatus: "CAPTURED",
      });
      if (result.changed) {
        await record(result.payment, "PAYMENT_CAPTURED", {
          paypalCaptureId: capture.captureId,
          paypalCaptureStatus: capture.captureStatus,
          amount: payment.amount,
          currency: payment.currency,
        });
      }
      return result.payment;
    },

    /** AUTHORIZED -> VOIDED. Never valid after capture. */
    async voidPayment(userId: string, paymentId: string) {
      const payment = await getOwned(userId, paymentId);
      if (payment.status === "VOIDED") return payment;
      if (payment.status !== "AUTHORIZED" || !payment.paypalAuthorizationId) {
        throw invalidTransition(payment, "VOIDED");
      }
      const authorizationId = payment.paypalAuthorizationId;

      const voided = await callPayPal(
        "voidAuthorization",
        { userId, entityType: "payment_attempt", entityId: payment.id },
        () => paypal.voidAuthorization(authorizationId, `void-${payment.id}`),
      );

      const result = await transition(payment, "VOIDED", {
        paypalAuthorizationStatus: voided.authorizationStatus,
      });
      if (result.changed) {
        await record(result.payment, "PAYMENT_VOIDED", {
          paypalAuthorizationId: authorizationId,
          paypalAuthorizationStatus: voided.authorizationStatus,
        });
      }
      return result.payment;
    },
  };
}
