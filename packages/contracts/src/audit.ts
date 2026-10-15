import { z } from "zod";

/** What an audit event is about. Also enforced by a database check. */
export const auditEntityTypeSchema = z.enum([
  "constraints",
  "proposal",
  "evaluation",
  "decision",
  "payment_attempt",
]);

export type AuditEntityType = z.infer<typeof auditEntityTypeSchema>;

/**
 * Event taxonomy. Names are past-tense facts in UPPER_SNAKE_CASE. Events are
 * never edited or deleted: a correction is a new event.
 */
export const auditEventTypeSchema = z.enum([
  // constraints
  "CONSTRAINTS_UPDATED",
  // proposal -> evaluation -> decision
  "PROPOSAL_CREATED",
  "EVALUATION_COMPLETED",
  "DECISION_RECORDED",
  "DECISION_APPROVED",
  "DECISION_REJECTED",
  // payment_attempt: one event per state transition
  "PAYMENT_CREATED",
  "PAYMENT_APPROVED",
  "PAYMENT_AUTHORIZED",
  "PAYMENT_CAPTURED",
  "PAYMENT_VOIDED",
  // third-party failures, with the provider's debug id
  "PAYPAL_CALL_FAILED",
]);

export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

export const auditEventSchema = z.object({
  id: z.number().int().positive(),
  entityType: auditEntityTypeSchema,
  entityId: z.string(),
  type: auditEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

/** Newest first. Pass the last event's id as `before` to get the next page. */
export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.number().int().positive().optional(),
  entityType: auditEntityTypeSchema.optional(),
  entityId: z.string().min(1).max(100).optional(),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;

export const activityPageSchema = z.object({
  events: z.array(auditEventSchema),
  /** Pass as `before` for the next page; null when there are no more. */
  nextBefore: z.number().int().positive().nullable(),
});

export type ActivityPage = z.infer<typeof activityPageSchema>;
