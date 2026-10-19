import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaypalWebhookEventRepository } from "../paypal-webhook-event-repository";

const UNIQUE_VIOLATION = "23505";

export function createSupabasePaypalWebhookEventRepository(
  db: SupabaseClient,
): PaypalWebhookEventRepository {
  return {
    async tryInsert(event) {
      const { error } = await db.from("paypal_webhook_events").insert({
        id: event.id,
        event_type: event.eventType,
        resource_type: event.resourceType,
        resource_id: event.resourceId,
        payload: event.payload,
      });
      if (error?.code === UNIQUE_VIOLATION) return false;
      if (error) throw error;
      return true;
    },
  };
}
