import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { auditEventSchema } from "@finpal/contracts";

import type { AuditEventRepository } from "../audit-event-repository";

const rowSchema = z.object({
  id: z.coerce.number(),
  entity_type: z.string(),
  entity_id: z.string(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});

// Writes need the service role (users cannot insert audit events). Reads work
// with a user-scoped client, where RLS also limits rows to the user's own.
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

    async list(userId, query) {
      let request = db
        .from("audit_events")
        .select("id, entity_type, entity_id, type, payload, created_at")
        .eq("user_id", userId)
        .order("id", { ascending: false })
        .limit(query.limit);
      if (query.before !== undefined) request = request.lt("id", query.before);
      if (query.entityType)
        request = request.eq("entity_type", query.entityType);
      if (query.entityId) request = request.eq("entity_id", query.entityId);

      const { data, error } = await request;
      if (error) throw error;

      return (data ?? []).map((raw) => {
        const row = rowSchema.parse(raw);
        return auditEventSchema.parse({
          id: row.id,
          entityType: row.entity_type,
          entityId: row.entity_id,
          type: row.type,
          payload: row.payload,
          createdAt: row.created_at,
        });
      });
    },
  };
}
