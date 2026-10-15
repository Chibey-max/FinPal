import type {
  ActivityQuery,
  AuditEntityType,
  AuditEvent,
  AuditEventType,
} from "@finpal/contracts";

export interface AuditEventInput {
  userId: string;
  entityType: AuditEntityType;
  entityId: string;
  type: AuditEventType;
  payload: Record<string, unknown>;
}

// Deliberately has no update or delete: audit events are append-only, and the
// database rejects UPDATE/DELETE on audit_events for every role.
export interface AuditEventRepository {
  append(event: AuditEventInput): Promise<void>;
  /** Newest first, scoped to the user. */
  list(userId: string, query: ActivityQuery): Promise<AuditEvent[]>;
}
