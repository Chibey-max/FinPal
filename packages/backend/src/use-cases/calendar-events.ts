import type { CalendarEvent, CalendarEventsPage } from "@finpal/contracts";

import type { CalendarClient } from "../integrations/google-calendar/calendar-client";

export interface CalendarEventsServiceDeps {
  calendar?: CalendarClient;
}

export type CalendarEventsService = ReturnType<
  typeof createCalendarEventsService
>;

/** Lists upcoming Google Calendar events for proposal prefill (Day 11). */
export function createCalendarEventsService(deps: CalendarEventsServiceDeps) {
  return {
    async listUpcoming(limit = 20): Promise<CalendarEventsPage> {
      if (!deps.calendar) {
        return { events: [], configured: false };
      }
      const events: CalendarEvent[] =
        await deps.calendar.listUpcomingEvents(limit);
      return { events, configured: true };
    },
  };
}
