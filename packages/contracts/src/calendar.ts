import { z } from "zod";

/** Upcoming event summary used to prefill a proposal (title + start only). */
export const calendarEventSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  startsAt: z.string(),
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const calendarEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CalendarEventsQuery = z.infer<typeof calendarEventsQuerySchema>;

export const calendarEventsPageSchema = z.object({
  events: z.array(calendarEventSchema),
  /** False when Google Calendar is not configured on the server. */
  configured: z.boolean(),
});

export type CalendarEventsPage = z.infer<typeof calendarEventsPageSchema>;
