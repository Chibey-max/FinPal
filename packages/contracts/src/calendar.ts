import { z } from "zod";

/** Upcoming event summary used to prefill a proposal (title + start only). */
export const calendarEventSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  /** ISO date-time, or a plain YYYY-MM-DD date for an all-day event. */
  startsAt: z.string(),
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const calendarEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CalendarEventsQuery = z.infer<typeof calendarEventsQuerySchema>;

export const calendarEventsPageSchema = z.object({
  events: z.array(calendarEventSchema),
  /** True when this user's calendar is connected and readable. */
  configured: z.boolean(),
  /** Google cancelled the connection; the user has to connect again. */
  needsReconnect: z.boolean().default(false),
});

export type CalendarEventsPage = z.infer<typeof calendarEventsPageSchema>;
