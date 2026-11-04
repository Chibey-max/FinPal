import type {
  AuditEntityType,
  AuditEventType,
  Basket,
  PaymentStatus,
  SpendingConstraints,
} from "@finpal/contracts";

import { PaymentError } from "../domain/payment-errors";
import { localDayRange, localMonthRange } from "../domain/zoned-time";
import { canTransitionPayment } from "../domain/payment-state-machine";
import {
  PayPalApiError,
  type PayPalClient,
} from "../integrations/paypal/paypal-client";
import type { AuditLog } from "../services/audit-log";
import type {
  DecisionRepository,
  PayableDecision,
} from "../repositories/decision-repository";
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
  /** Reads the caps a basket's total must fit. Omit to skip that check. */
  constraints?: { get(userId: string): Promise<SpendingConstraints | null> };
  now?: () => Date;
  /** Where PayPal sends the buyer after approving; PayPal appends ?token=<orderId>. */
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatePaymentOrderInput {
  userId: string;
  decisionId: string;
  idempotencyKey: string;
}

export interface CreateBasketInput {
  userId: string;
  decisionIds: string[];
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

  // AUTO_APPROVE is always payable. MANUAL_REVIEW is payable only after
  // reviewer approval. BLOCK and rejected reviews never are.
  function assertPayable(decision: {
    outcome: string;
    reviewStatus: string | null;
  }) {
    const payable =
      decision.outcome === "AUTO_APPROVE" ||
      (decision.outcome === "MANUAL_REVIEW" &&
        decision.reviewStatus === "APPROVED");
    if (payable) return;
    throw new PaymentError(
      "DECISION_NOT_PAYABLE",
      decision.outcome === "MANUAL_REVIEW" &&
        decision.reviewStatus === "REJECTED"
        ? "This decision was rejected and cannot be paid."
        : decision.outcome === "MANUAL_REVIEW"
          ? "This decision still needs reviewer approval before payment."
          : `A ${decision.outcome} decision cannot be paid.`,
      { outcome: decision.outcome, reviewStatus: decision.reviewStatus },
    );
  }

  /**
   * Each item passed the caps alone, because nothing was committed yet. The
   * total has to fit too, or two $300 items would slip past a $400 daily cap.
   */
  async function assertWithinCaps(
    userId: string,
    total: number,
    currency: string,
  ) {
    const constraints = await deps.constraints?.get(userId);
    if (!constraints || constraints.currency !== currency) return;
    const at = deps.now?.() ?? new Date();
    const { daily, monthly } = constraints.amountCaps;
    const check = async (
      cap: number | undefined,
      range: { start: Date; end: Date },
      label: string,
    ) => {
      if (cap === undefined) return;
      const committed = await payments.sumCommitted(
        userId,
        currency,
        range.start,
        range.end,
      );
      const left = Math.max(0, cap - committed);
      if (Math.round(total * 100) > Math.round(left * 100)) {
        throw new PaymentError(
          "BASKET_OVER_CAP",
          `This basket is ${currency} ${total.toFixed(2)}, but only ${currency} ${left.toFixed(2)} is left of your ${label} budget. Nothing was charged.`,
          { cap, committed, total, period: label },
        );
      }
    };
    await check(daily, localDayRange(at, constraints.timezone), "daily");
    await check(monthly, localMonthRange(at, constraints.timezone), "monthly");
  }

  function toBasket(rows: PaymentAttemptRecord[]): Basket {
    const first = rows[0];
    if (!first?.basketId) {
      throw new PaymentError("PAYMENT_NOT_FOUND", "Basket not found.");
    }
    const cents = rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0);
    // Rows move together; the least advanced one says where the basket is.
    const order: PaymentStatus[] = [
      "CREATED",
      "APPROVED",
      "AUTHORIZED",
      "CAPTURED",
      "VOIDED",
      "REFUNDED",
    ];
    const status = order.find((s) => rows.some((r) => r.status === s))!;
    return {
      id: first.basketId,
      total: cents / 100,
      currency: first.currency,
      status,
      paypalOrderId: first.paypalOrderId,
      approveUrl: first.approveUrl,
      items: rows,
    };
  }

  async function getBasketRows(userId: string, basketId: string) {
    const rows = await payments.findByBasketId(userId, basketId);
    if (!rows.length) {
      throw new PaymentError("PAYMENT_NOT_FOUND", "Basket not found.");
    }
    return rows;
  }

  // Moves the rows still in `from`, audits each one, and returns all rows.
  async function moveBasket(
    userId: string,
    basketId: string,
    from: PaymentStatus,
    patch: PaymentAttemptPatch,
    type: AuditEventType,
    payload: (row: PaymentAttemptRecord) => Record<string, unknown>,
  ) {
    const moved = await payments.updateBasketIfStatus(
      userId,
      basketId,
      from,
      patch,
    );
    for (const row of moved) await record(row, type, payload(row));
    return getBasketRows(userId, basketId);
  }

  /**
   * After the buyer approves: confirm with PayPal, authorize, capture. Each
   * step is skipped once done, so a retry after a failure picks up where it
   * stopped. Rechecks the caps first, since spend may have changed.
   */
  async function settle(userId: string, basketId: string) {
    let rows = await getBasketRows(userId, basketId);
    const first = rows[0]!;
    const entity = {
      userId,
      entityType: "payment_attempt" as const,
      entityId: first.id,
    };
    const has = (status: PaymentStatus) =>
      rows.some((row) => row.status === status);
    if (has("VOIDED")) throw invalidTransition(first, "CAPTURED");

    if (has("CREATED") || has("APPROVED")) {
      const basket = toBasket(rows);
      await assertWithinCaps(userId, basket.total, basket.currency);
    }

    if (has("CREATED")) {
      const order = await callPayPal("getOrder", entity, () =>
        paypal.getOrder(first.paypalOrderId),
      );
      if (!approvedOrderStatuses.has(order.status)) {
        throw new PaymentError(
          "ORDER_NOT_APPROVED",
          "The buyer has not approved this order in PayPal yet.",
          { paypalOrderStatus: order.status },
        );
      }
      rows = await moveBasket(
        userId,
        basketId,
        "CREATED",
        { status: "APPROVED", paypalOrderStatus: order.status },
        "PAYMENT_APPROVED",
        (row) => ({
          basketId,
          paypalOrderId: row.paypalOrderId,
          paypalOrderStatus: order.status,
        }),
      );
    }

    if (has("APPROVED")) {
      const authorization = await callPayPal("authorizeOrder", entity, () =>
        paypal.authorizeOrder(first.paypalOrderId, `authorize-${basketId}`),
      );
      if (deniedAuthorizationStatuses.has(authorization.authorizationStatus)) {
        throw new PaymentError(
          "PAYPAL_DECLINED",
          "PayPal did not authorize this payment.",
          { paypalAuthorizationStatus: authorization.authorizationStatus },
        );
      }
      rows = await moveBasket(
        userId,
        basketId,
        "APPROVED",
        {
          status: "AUTHORIZED",
          paypalOrderStatus: authorization.orderStatus,
          paypalAuthorizationId: authorization.authorizationId,
          paypalAuthorizationStatus: authorization.authorizationStatus,
        },
        "PAYMENT_AUTHORIZED",
        (row) => ({
          basketId,
          paypalAuthorizationId: authorization.authorizationId,
          paypalAuthorizationStatus: authorization.authorizationStatus,
          amount: row.amount,
          currency: row.currency,
        }),
      );
    }

    if (has("AUTHORIZED")) {
      const authorizationId = rows.find(
        (row) => row.paypalAuthorizationId,
      )?.paypalAuthorizationId;
      if (!authorizationId) throw invalidTransition(first, "CAPTURED");
      const capture = await callPayPal("captureAuthorization", entity, () =>
        paypal.captureAuthorization(authorizationId, `capture-${basketId}`),
      );
      if (failedCaptureStatuses.has(capture.captureStatus)) {
        throw new PaymentError(
          "PAYPAL_DECLINED",
          "PayPal declined the capture.",
          { paypalCaptureStatus: capture.captureStatus },
        );
      }
      rows = await moveBasket(
        userId,
        basketId,
        "AUTHORIZED",
        {
          status: "CAPTURED",
          paypalCaptureId: capture.captureId,
          paypalCaptureStatus: capture.captureStatus,
          paypalAuthorizationStatus: "CAPTURED",
        },
        "PAYMENT_CAPTURED",
        (row) => ({
          basketId,
          paypalCaptureId: capture.captureId,
          paypalCaptureStatus: capture.captureStatus,
          amount: row.amount,
          currency: row.currency,
        }),
      );
    }
    return toBasket(rows);
  }

  async function voidBasket(userId: string, basketId: string) {
    const rows = await getBasketRows(userId, basketId);
    const first = rows[0]!;
    if (rows.every((row) => row.status === "VOIDED")) return first;
    const authorizationId = first.paypalAuthorizationId;
    if (
      !authorizationId ||
      rows.some((row) => row.status !== "AUTHORIZED" && row.status !== "VOIDED")
    ) {
      throw invalidTransition(first, "VOIDED");
    }
    const voided = await callPayPal(
      "voidAuthorization",
      { userId, entityType: "payment_attempt", entityId: first.id },
      () => paypal.voidAuthorization(authorizationId, `void-${basketId}`),
    );
    const updated = await moveBasket(
      userId,
      basketId,
      "AUTHORIZED",
      {
        status: "VOIDED",
        paypalAuthorizationStatus: voided.authorizationStatus,
      },
      "PAYMENT_VOIDED",
      () => ({
        basketId,
        paypalAuthorizationId: authorizationId,
        paypalAuthorizationStatus: voided.authorizationStatus,
      }),
    );
    return updated[0]!;
  }

  // A basket item moves with its basket; returns its own row afterwards.
  const itemOf = (basket: Basket, paymentId: string) =>
    (basket.items as PaymentAttemptRecord[]).find((r) => r.id === paymentId)!;

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

    async getBasket(userId: string, basketId: string): Promise<Basket> {
      return toBasket(await getBasketRows(userId, basketId));
    },

    /**
     * One PayPal order for several decisions, with one row per item. Retrying
     * with the same key returns the same basket and creates nothing new.
     */
    async createBasketOrder(input: CreateBasketInput): Promise<Basket> {
      const { userId, idempotencyKey } = input;
      const decisionIds = [...new Set(input.decisionIds)];
      const itemKey = (index: number) => `${idempotencyKey}-${index}`;

      const replay = async () => {
        const existing = await payments.findByIdempotencyKey(
          userId,
          itemKey(0),
        );
        if (!existing) return null;
        const rows = existing.basketId
          ? await payments.findByBasketId(userId, existing.basketId)
          : [];
        const same =
          rows.length === decisionIds.length &&
          rows.every((row) => decisionIds.includes(row.decisionId));
        if (!same) {
          throw new PaymentError(
            "IDEMPOTENCY_KEY_REUSED",
            "This idempotency key was already used for a different basket.",
          );
        }
        return toBasket(rows);
      };
      const replayed = await replay();
      if (replayed) return replayed;

      const items: PayableDecision[] = [];
      for (const decisionId of decisionIds) {
        const decision = await decisions.findForPayment(userId, decisionId);
        if (!decision) {
          throw new PaymentError("DECISION_NOT_FOUND", "Decision not found.");
        }
        assertPayable(decision);
        if (await payments.findActiveByDecisionId(userId, decisionId)) {
          throw new PaymentError(
            "DECISION_ALREADY_PAID",
            `${decision.productName} already has an active payment.`,
          );
        }
        items.push(decision);
      }
      const first = items[0];
      if (!first) {
        throw new PaymentError("DECISION_NOT_FOUND", "The basket is empty.");
      }
      const currency = first.currency;
      if (items.some((item) => item.currency !== currency)) {
        throw new PaymentError(
          "DECISION_NOT_PAYABLE",
          "Items in different currencies can't share one PayPal order.",
        );
      }
      const total =
        items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) /
        100;
      await assertWithinCaps(userId, total, currency);

      const order = await callPayPal(
        "createOrder",
        { userId, entityType: "decision", entityId: first.decisionId },
        () =>
          paypal.createOrder({
            amount: total,
            currency,
            description:
              items.length === 1
                ? first.productName
                : `FinPal basket: ${items.length} items`,
            items: items.map((item) => ({
              name: item.productName,
              amount: item.amount,
            })),
            requestId: `order-${userId}-${idempotencyKey}`,
            returnUrl: deps.returnUrl,
            cancelUrl: deps.cancelUrl,
          }),
      );

      const basketId = crypto.randomUUID();
      let rows: PaymentAttemptRecord[];
      try {
        rows = await payments.insertMany(
          items.map((item, index) => ({
            userId,
            decisionId: item.decisionId,
            basketId,
            idempotencyKey: itemKey(index),
            status: "CREATED" as const,
            amount: item.amount,
            currency,
            paypalOrderId: order.orderId,
            paypalOrderStatus: order.status,
            paypalAuthorizationId: null,
            paypalAuthorizationStatus: null,
            paypalCaptureId: null,
            paypalCaptureStatus: null,
            approveUrl: order.approveUrl,
          })),
        );
      } catch (error) {
        if (!(error instanceof DuplicatePaymentAttemptError)) throw error;
        const winner = await replay();
        if (winner) return winner;
        throw new PaymentError(
          "DECISION_ALREADY_PAID",
          "An item in this basket already has an active payment.",
        );
      }

      for (const row of rows) {
        await record(row, "PAYMENT_CREATED", {
          decisionId: row.decisionId,
          basketId,
          paypalOrderId: order.orderId,
          paypalOrderStatus: order.status,
          amount: row.amount,
          currency,
        });
      }
      return toBasket(rows);
    },

    /** Approved in PayPal: authorize and capture the whole basket. */
    async settleBasket(userId: string, basketId: string): Promise<Basket> {
      return settle(userId, basketId);
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
      assertPayable(decision);
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
          basketId: null,
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
      const payment = await getOwned(userId, paymentId);
      if (payment.basketId) {
        return itemOf(await settle(userId, payment.basketId), payment.id);
      }
      return authorize(payment);
    },

    /** Entry point for PayPal's return redirect, which only carries the order id. */
    async completeApproval(userId: string, paypalOrderId: string) {
      const payment = await payments.findByPayPalOrderId(userId, paypalOrderId);
      if (!payment) {
        throw new PaymentError("PAYMENT_NOT_FOUND", "Payment not found.");
      }
      // A basket is paid in one go: the buyer has already approved it.
      if (payment.basketId) {
        return itemOf(await settle(userId, payment.basketId), payment.id);
      }
      return authorize(payment);
    },

    /** AUTHORIZED -> CAPTURED. Idempotent once captured. */
    async capturePayment(userId: string, paymentId: string) {
      const payment = await getOwned(userId, paymentId);
      if (payment.status === "CAPTURED") return payment;
      if (payment.basketId) {
        return itemOf(await settle(userId, payment.basketId), payment.id);
      }
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
      if (payment.basketId) return voidBasket(userId, payment.basketId);
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
