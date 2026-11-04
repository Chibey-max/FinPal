"use client";

import type { CalendarEvent, TimeWindow } from "@finpal/contracts";
import Link from "next/link";
import { useState } from "react";

import { Pagination, paginate } from "@/components/pagination";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { formatEventDate } from "@/features/app/present";

import { BryntumWeek } from "./bryntum-week";

const EVENTS_PER_PAGE = 5;

export function CalendarWeek({
  events,
  windows,
  configured,
  needsReconnect,
  canConnect,
  timeZone,
  weekStart,
  firstDate,
}: {
  events: CalendarEvent[];
  /** The user's allowed spending windows, shaded on the calendar. */
  windows: TimeWindow[];
  /** True when this user's calendar is connected. */
  configured: boolean;
  /** Google cancelled the connection; the user has to connect again. */
  needsReconnect: boolean;
  /** False when connecting isn't possible (mock mode or no OAuth client). */
  canConnect: boolean;
  timeZone: string;
  weekStart: string;
  firstDate: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestedPage, setRequestedPage] = useState(1);
  const selected = events.find((event) => event.id === selectedId) ?? null;
  const { page, pageCount, start, end } = paginate(
    events.length,
    requestedPage,
    EVENTS_PER_PAGE,
  );

  return (
    <div className="split-grid split-grid--wide">
      <section className="card span-2 calendar-card" aria-label="Calendar">
        <BryntumWeek
          events={events}
          windows={windows}
          timeZone={timeZone}
          weekStart={weekStart}
          firstDate={firstDate}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </section>

      <aside className="card stack-card" aria-live="polite">
        <span className="eyebrow">Selected event</span>
        {selected ? (
          <div className="fade-in stack-card" key={selected.id}>
            <span className="event-title">{selected.title}</span>
            <span className="mono ink2">
              {formatEventDate(selected.startsAt, timeZone)}
            </span>
            <span className="small muted">
              Adds this event to your shopping list, so you can say what you
              need for it.
            </span>
            <LiquidButton asChild size="lg" className="w-full rounded-full">
              <Link
                href={`/app/agent?need=${encodeURIComponent(`Something for ${selected.title}`)}`}
              >
                Shop for this event
              </Link>
            </LiquidButton>
          </div>
        ) : needsReconnect ? (
          <div className="stack-card">
            <span className="muted">
              Google ended this calendar connection. Connect it again to see
              your events.
            </span>
            <a href="/api/v1/calendar/connect" className="btn btn-outline">
              Reconnect Google Calendar
            </a>
          </div>
        ) : !configured ? (
          <div className="stack-card">
            <span className="muted">
              {canConnect
                ? "Connect your calendar so the agent can suggest what you might need for upcoming events. FinPal only reads titles and times."
                : "Calendar connection isn't set up on this server."}
            </span>
            {canConnect ? (
              <a href="/api/v1/calendar/connect" className="btn btn-outline">
                Connect Google Calendar
              </a>
            ) : null}
          </div>
        ) : events.length === 0 ? (
          <span className="muted">No upcoming events.</span>
        ) : (
          <span className="muted">Pick an event in the calendar or below.</span>
        )}
        {events.length ? (
          // Same events as a plain list: keyboard and screen-reader friendly.
          <div className="stack-sm">
            <span className="eyebrow">Upcoming</span>
            {events.slice(start, end).map((event) => (
              <button
                key={event.id}
                type="button"
                className="event-chip"
                aria-pressed={event.id === selectedId}
                onClick={() => setSelectedId(event.id)}
              >
                <span className="mono">
                  {formatEventDate(event.startsAt, timeZone)}
                </span>
                {event.title}
              </button>
            ))}
            <Pagination
              page={page}
              pageCount={pageCount}
              total={events.length}
              pageSize={EVENTS_PER_PAGE}
              label="events"
              onPage={setRequestedPage}
            />
          </div>
        ) : null}
        {windows.length ? (
          <span className="calendar-legend small ink3">
            <i aria-hidden /> Shaded hours: spending allowed by your rules
          </span>
        ) : null}
        {configured && canConnect ? (
          <form action="/api/v1/calendar/disconnect" method="post">
            <button type="submit" className="link-quiet">
              Disconnect Google Calendar
            </button>
          </form>
        ) : null}
        <span className="footnote">
          {configured
            ? "FinPal reads only event titles and start times."
            : "Google Calendar isn't connected."}
        </span>
      </aside>
    </div>
  );
}
