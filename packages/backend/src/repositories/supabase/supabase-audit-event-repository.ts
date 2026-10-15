import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuditEventRepository } from "../audit-event-repository";

export function createSupabaseAuditEventRepository(
  db: SupabaseClient,
): AuditEventRepository {
  return {
    async append(event) {
      const { error } = await db.from("audit_events").insert({
        user_id: event.userId,
        entity_type: event.entityType,
        entity_id: event.entityId,
        type: event.type,
        payload: event.payload,
      });
      if (error) throw error;
    },
  };
}
