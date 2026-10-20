"use client";

import type { CalendarEvent, TimeWindow } from "@finpal/contracts";
import Link from "next/link";
import { useState } from "react";

import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { formatEventDate } from "@/features/app/present";

import { BryntumWeek } from "./bryntum-week";

export function CalendarWeek({
  events,
  windows,
  configured,
  timeZone,
  weekStart,
  firstDate,
}: {
  events: CalendarEvent[];
  /** The user's allowed spending windows, shaded on the calendar. */
  windows: TimeWindow[];
  /** False when no calendar provider is connected on the server. */
  configured: boolean;
  timeZone: string;
  weekStart: string;
  firstDate: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = events.find((event) => event.id === selectedId) ?? null;

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
          <span className="muted">Pick an event in the calendar or below.</span>
        )}
        {events.length ? (
          // Same events as a plain list: keyboard and screen-reader friendly.
          <div className="stack-sm">
            <span className="eyebrow">Upcoming</span>
            {events.slice(0, 8).map((event) => (
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
        {windows.length ? (
          <span className="calendar-legend small ink3">
            <i aria-hidden /> Shaded hours: spending allowed by your constraints
          </span>
        ) : null}
        <span className="footnote">
          {configured
            ? "Bryntum Calendar · Google Calendar, title and start time only"
            : "Bryntum Calendar · Google Calendar not connected"}
        </span>
      </aside>
    </div>
  );
}
