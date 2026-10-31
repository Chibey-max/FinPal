import type { PaypalWebhookEventRepository } from "../paypal-webhook-event-repository";
import { json, type Db } from "./db";

export function createPostgresPaypalWebhookEventRepository(
  db: Db,
): PaypalWebhookEventRepository {
  return {
    async tryInsert(event) {
      const { rowCount } = await db.query(
        `insert into public.paypal_webhook_events (id, event_type, resource_type, resource_id, payload)
         values ($1, $2, $3, $4, $5::jsonb)
         on conflict (id) do nothing`,
        [
          event.id,
          event.eventType,
          event.resourceType,
          event.resourceId,
          json(event.payload),
        ],
      );
      return rowCount === 1;
    },
  };
}
