import { z } from "zod";

import { canTransitionPayment } from "../domain/payment-state-machine";
import type { PayPalClient } from "../integrations/paypal/paypal-client";
import type { AuditLog } from "../services/audit-log";
import type { PaymentAttemptRepository } from "../repositories/payment-attempt-repository";
import type { PaypalWebhookEventRepository } from "../repositories/paypal-webhook-event-repository";

export class WebhookError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "INVALID_SIGNATURE" | "INVALID_PAYLOAD",
    message: string,
  ) {
    super(message);
    this.name = "WebhookError";
  }
}

export interface PaypalWebhookHeaders {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}

export interface PaypalWebhookServiceDeps {
  paypal: PayPalClient;
  payments: PaymentAttemptRepository;
  events: PaypalWebhookEventRepository;
  audit: Pick<AuditLog, "record">;
  webhookId: string | undefined;
}

const webhookEventSchema = z.object({
  id: z.string().min(1),
  event_type: z.string().min(1),
  resource_type: z.string().optional(),
  resource: z
    .object({
      id: z.string().optional(),
      status: z.string().optional(),
      supplementary_data: z
        .object({
          related_ids: z
            .object({
              order_id: z.string().optional(),
              authorization_id: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .passthrough()
    .optional(),
});

export type PaypalWebhookService = ReturnType<
  typeof createPaypalWebhookService
>;

/**
 * Verifies PayPal webhook signatures and applies known payment state updates
 * idempotently. Unknown event types are acknowledged after recording.
 */
export function createPaypalWebhookService(deps: PaypalWebhookServiceDeps) {
  const { paypal, payments, events, audit } = deps;

  return {
    async handle(headers: PaypalWebhookHeaders, rawBody: unknown) {
      if (!deps.webhookId) {
        throw new WebhookError(
          "NOT_CONFIGURED",
          "PAYPAL_WEBHOOK_ID is not configured.",
        );
      }

      const verified = await paypal.verifyWebhookSignature({
        ...headers,
        webhookId: deps.webhookId,
        webhookEvent: rawBody,
      });
      if (!verified) {
        throw new WebhookError(
          "INVALID_SIGNATURE",
          "PayPal webhook signature verification failed.",
        );
      }

      const parsed = webhookEventSchema.safeParse(rawBody);
      if (!parsed.success) {
        throw new WebhookError(
          "INVALID_PAYLOAD",
          "PayPal webhook payload was invalid.",
        );
      }
      const event = parsed.data;
      const resourceId = event.resource?.id ?? null;

      const firstDelivery = await events.tryInsert({
        id: event.id,
        eventType: event.event_type,
        resourceType: event.resource_type ?? null,
        resourceId,
        payload:
          typeof rawBody === "object" && rawBody !== null
            ? (rawBody as Record<string, unknown>)
            : { raw: rawBody },
      });
      if (!firstDelivery) {
        return { status: "duplicate" as const, eventId: event.id };
      }

      await applyPaymentEvent(event);
      return { status: "processed" as const, eventId: event.id };
    },
  };

  async function applyPaymentEvent(
    event: z.infer<typeof webhookEventSchema>,
  ): Promise<void> {
    const orderId =
      event.resource?.supplementary_data?.related_ids?.order_id ??
      (event.resource_type === "checkout-order"
        ? event.resource?.id
        : undefined);
    const authorizationId =
      event.resource?.supplementary_data?.related_ids?.authorization_id ??
      (event.event_type.startsWith("PAYMENT.AUTHORIZATION.")
        ? event.resource?.id
        : undefined);

    const payment =
      (orderId ? await payments.findAnyByPayPalOrderId(orderId) : null) ??
      (authorizationId
        ? await payments.findAnyByPayPalAuthorizationId(authorizationId)
        : null);
    if (!payment) return;

    // Mirror a subset of PayPal events into FinPal state. Capture/void from
    // the product API remain the primary path; webhooks catch missed updates.
    if (
      event.event_type === "CHECKOUT.ORDER.APPROVED" &&
      canTransitionPayment(payment.status, "APPROVED")
    ) {
      const updated = await payments.updateIfStatus(payment.id, "CREATED", {
        status: "APPROVED",
        paypalOrderStatus: event.resource?.status ?? "APPROVED",
      });
      if (updated) {
        await audit.record({
          userId: payment.userId,
          entityType: "payment_attempt",
          entityId: payment.id,
          type: "PAYMENT_APPROVED",
          payload: {
            source: "webhook",
            eventId: event.id,
            paypalOrderId: payment.paypalOrderId,
          },
        });
      }
      return;
    }

    if (
      event.event_type === "PAYMENT.AUTHORIZATION.VOIDED" &&
      payment.status === "AUTHORIZED" &&
      canTransitionPayment(payment.status, "VOIDED")
    ) {
      const updated = await payments.updateIfStatus(payment.id, "AUTHORIZED", {
        status: "VOIDED",
        paypalAuthorizationStatus: event.resource?.status ?? "VOIDED",
      });
      if (updated) {
        await audit.record({
          userId: payment.userId,
          entityType: "payment_attempt",
          entityId: payment.id,
          type: "PAYMENT_VOIDED",
          payload: {
            source: "webhook",
            eventId: event.id,
            paypalAuthorizationId: payment.paypalAuthorizationId,
          },
        });
      }
    }
  }
}
