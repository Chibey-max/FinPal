export interface AuditEventInput {
  userId: string;
  entityType: string;
  entityId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface AuditEventRepository {
  append(event: AuditEventInput): Promise<void>;
}
