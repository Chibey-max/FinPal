import { z } from "zod";

import { auditEventSchema } from "@finpal/contracts";

import type { AuditEventRepository } from "../audit-event-repository";
import { json, queryRows, type Db } from "./db";

const rowSchema = z.object({
  id: z.coerce.number(),
  entity_type: z.string(),
  entity_id: z.string(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});

// Insert-only: the database rejects UPDATE/DELETE on audit_events, and reads
// are always filtered to the user's own events.
export function createPostgresAuditEventRepository(
  db: Db,
): AuditEventRepository {
  return {
    async append(event) {
      await db.query(
        `insert into public.audit_events (user_id, entity_type, entity_id, type, payload)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [
          event.userId,
          event.entityType,
          event.entityId,
          event.type,
          json(event.payload),
        ],
      );
    },

    async list(userId, query) {
      const values: unknown[] = [userId];
      const filters = ["user_id = $1"];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        filters.push(`${condition} $${values.length}`);
      };
      if (query.before !== undefined) add("id <", query.before);
      if (query.entityType) add("entity_type =", query.entityType);
      if (query.entityId) add("entity_id =", query.entityId);
      values.push(query.limit);

      const rows = await queryRows(
        db,
        `select to_jsonb(a) as row from public.audit_events a
         where ${filters.join(" and ")}
         order by id desc
         limit $${values.length}`,
        values,
      );

      return rows.map((raw) => {
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
