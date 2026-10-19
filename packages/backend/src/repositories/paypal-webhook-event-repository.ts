export interface PaypalWebhookEventRecord {
  id: string;
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
  payload: Record<string, unknown>;
  processedAt: string;
}

export interface NewPaypalWebhookEvent {
  id: string;
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
  payload: Record<string, unknown>;
}

/** Idempotent store of PayPal webhook deliveries (primary key = event id). */
export interface PaypalWebhookEventRepository {
  /**
   * Inserts the event. Returns true if this was the first delivery, false if
   * the event id was already recorded.
   */
  tryInsert(event: NewPaypalWebhookEvent): Promise<boolean>;
}
