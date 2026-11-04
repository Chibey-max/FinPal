import type { CalendarEvent, CalendarEventsPage } from "@finpal/contracts";

import type { CalendarClient } from "../integrations/google-calendar/calendar-client";

export interface CalendarEventsServiceDeps {
  calendar?: CalendarClient;
}

export type CalendarEventsService = ReturnType<
  typeof createCalendarEventsService
>;

/** Lists upcoming events from one calendar client. Used for mock mode's sample calendar. */
export function createCalendarEventsService(deps: CalendarEventsServiceDeps) {
  return {
    async listUpcoming(limit = 20): Promise<CalendarEventsPage> {
      if (!deps.calendar) {
        return { events: [], configured: false, needsReconnect: false };
      }
      const events: CalendarEvent[] =
        await deps.calendar.listUpcomingEvents(limit);
      return { events, configured: true, needsReconnect: false };
    },
  };
}
