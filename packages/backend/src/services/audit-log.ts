import {
  activityQuerySchema,
  type ActivityPage,
  type ActivityQuery,
} from "@finpal/contracts";

import { sanitizeAuditPayload } from "../domain/audit-payload";
import type {
  AuditEventInput,
  AuditEventRepository,
} from "../repositories/audit-event-repository";

export interface AuditLog {
  /** Appends one event. There is intentionally no way to edit or delete. */
  record(event: AuditEventInput): Promise<void>;
  listActivity(
    userId: string,
    query?: Partial<ActivityQuery>,
  ): Promise<ActivityPage>;
}

export function createAuditLog(repository: AuditEventRepository): AuditLog {
  return {
    async record(event) {
      await repository.append({
        ...event,
        payload: sanitizeAuditPayload(event.payload),
      });
    },

    async listActivity(userId, query = {}) {
      const parsed = activityQuerySchema.parse(query);
      // Fetch one extra row to know whether another page exists.
      const rows = await repository.list(userId, {
        ...parsed,
        limit: parsed.limit + 1,
      });
      const events = rows.slice(0, parsed.limit);
      const hasMore = rows.length > parsed.limit;
      return {
        events,
        nextBefore: hasMore ? (events.at(-1)?.id ?? null) : null,
      };
    },
  };
}
