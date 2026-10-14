export interface CalendarEventSummary {
  id: string;
  title: string;
  startsAt: string;
}

export interface CalendarClient {
  listUpcomingEvents(): Promise<CalendarEventSummary[]>;
}
