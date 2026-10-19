"use client";

import type { CalendarEvent } from "@finpal/contracts";
import Link from "next/link";
import { useState } from "react";

import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { formatEventDate } from "@/features/app/present";
import { localDate } from "@/lib/zoned";

export interface CalendarDay {
  /** "YYYY-MM-DD" in the user's timezone. */
  date: string;
  dow: string;
  num: string;
}

export function CalendarWeek({
  days,
  events,
  configured,
  timeZone,
}: {
  days: CalendarDay[];
  events: CalendarEvent[];
  /** False when no calendar provider is connected on the server. */
  configured: boolean;
  timeZone: string;
}) {
  const weekDates = new Set(days.map((day) => day.date));
  // Upcoming events that fall outside the week shown in the grid.
  const later = events.filter(
    (event) => !weekDates.has(localDate(new Date(event.startsAt), timeZone)),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = events.find((event) => event.id === selectedId) ?? null;
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));

  return (
    <div className="split-grid split-grid--wide">
      <section className="card span-2 week-scroll" aria-label="Week">
        <div className="week-grid">
          {days.map((day) => {
            const dayEvents = events.filter(
              (event) =>
                localDate(new Date(event.startsAt), timeZone) === day.date,
            );
            return (
              <div key={day.date} className="week-day">
                <div className="week-day__head">
                  <span className="eyebrow">{day.dow}</span>
                  <span className="week-day__num">{day.num}</span>
                </div>
                <div className="week-day__events">
                  {dayEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className="event-chip"
                      aria-pressed={event.id === selectedId}
                      onClick={() => setSelectedId(event.id)}
                    >
                      <span className="mono">{time(event.startsAt)}</span>
                      {event.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
              Prefills source, context and evaluation time. You still enter the
              product name and price.
            </span>
            <LiquidButton asChild size="lg" className="w-full rounded-full">
              <Link
                href={`/app/proposals/new?event=${encodeURIComponent(selected.id)}`}
              >
                Create proposal from event
              </Link>
            </LiquidButton>
          </div>
        ) : !configured ? (
          <span className="muted">
            No calendar is connected yet. Proposals can still be created by
            hand.
          </span>
        ) : events.length === 0 ? (
          <span className="muted">No upcoming events.</span>
        ) : (
          <span className="muted">Pick an event in the week.</span>
        )}
        {later.length ? (
          <div className="stack-sm">
            <span className="eyebrow">Coming up later</span>
            {later.slice(0, 6).map((event) => (
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
          </div>
        ) : null}
        <span className="footnote">
          {configured
            ? "Google Calendar · title and start time only"
            : "Google Calendar · not connected"}
        </span>
      </aside>
    </div>
  );
}
