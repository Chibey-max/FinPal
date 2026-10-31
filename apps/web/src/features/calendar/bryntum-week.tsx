"use client";

// Type-only imports: erased at build time, so the bundler never touches
// Bryntum's 5 MB module. The runtime comes from the served UMD bundle.
import type { Calendar, CalendarConfig, EventModel } from "@bryntum/calendar";
import type { CalendarEvent, TimeWindow } from "@finpal/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { isAllDay } from "@/features/app/present";

import { bryntumUrl } from "./bryntum-assets";
import "./bryntum-theme.css";
import { spendingRanges } from "./spending-windows";

/** Google gives a start time only; events show as one-hour blocks. */
const EVENT_MS = 60 * 60 * 1000;
/** Shade spending windows a week before and five weeks after the start. */
const SHADE_BEFORE_DAYS = 7;
const SHADE_DAYS = 42;
const STYLESHEETS = [
  "calendar.css",
  "svalbard-light.css",
  "fontawesome/css/fontawesome.css",
  "fontawesome/css/solid.css",
];

type BryntumModule = { Calendar: new (config: CalendarConfig) => Calendar };
type BryntumWindow = Window & { bryntum?: { calendar?: BryntumModule } };

let loading: Promise<BryntumModule> | null = null;

/** Adds Bryntum's stylesheets and UMD script once per page. */
function loadBryntum(): Promise<BryntumModule> {
  const loaded = (window as BryntumWindow).bryntum?.calendar;
  if (loaded) return Promise.resolve(loaded);
  for (const file of STYLESHEETS) {
    const href = bryntumUrl(file);
    if (document.querySelector(`link[href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    // Before our own styles, so the FinPal theme bridge wins ties.
    document.head.prepend(link);
  }
  loading ??= new Promise<BryntumModule>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = bryntumUrl("calendar.umd.js");
    script.async = true;
    script.onload = () => {
      const bryntum = (window as BryntumWindow).bryntum?.calendar;
      if (bryntum) resolve(bryntum);
      else reject(new Error("Bryntum Calendar did not load."));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("Bryntum Calendar could not be downloaded."));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Bryntum Calendar (sponsor tool, Day 12): calendar events plus the user's
 * allowed spending windows. Read-only: events only ever prefill a proposal,
 * so editing, dragging, creating and menus are all off.
 */
export function BryntumWeek({
  events,
  windows,
  timeZone,
  weekStart,
  firstDate,
  selectedId,
  onSelect,
}: {
  events: CalendarEvent[];
  windows: TimeWindow[];
  timeZone: string;
  /** Instant at noon on the first day shown, in the user's timezone. */
  weekStart: string;
  /** "YYYY-MM-DD" of the first day shown. */
  firstDate: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<Calendar | null>(null);
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const eventData = useMemo(
    () =>
      events.map((event) => {
        if (isAllDay(event.startsAt)) {
          const [year = 0, month = 1, day = 1] = event.startsAt
            .split("-")
            .map(Number);
          return {
            id: event.id,
            name: event.title,
            startDate: new Date(year, month - 1, day),
            endDate: new Date(year, month - 1, day + 1),
            allDay: true,
            readOnly: true,
            cls: event.id === selectedId ? "fp-event-selected" : "",
          };
        }
        const start = new Date(event.startsAt);
        return {
          id: event.id,
          // Bryntum sets event names as text, never HTML.
          name: event.title,
          startDate: start,
          endDate: new Date(start.getTime() + EVENT_MS),
          readOnly: true,
          cls: event.id === selectedId ? "fp-event-selected" : "",
        };
      }),
    [events, selectedId],
  );

  const timeRanges = useMemo(() => {
    const [year, month, day] = firstDate.split("-").map(Number);
    const from = new Date(Date.UTC(year!, month! - 1, day! - SHADE_BEFORE_DAYS))
      .toISOString()
      .slice(0, 10);
    return spendingRanges(windows, from, SHADE_DAYS, timeZone).map((range) => ({
      id: range.id,
      name: "",
      startDate: range.startDate,
      endDate: range.endDate,
      cls: "fp-spend-window",
    }));
  }, [windows, firstDate, timeZone]);

  // The latest data, read once when the async load finishes and the
  // calendar is created.
  const initial = useRef({ eventData, timeRanges, timeZone, weekStart });
  useEffect(() => {
    initial.current = { eventData, timeRanges, timeZone, weekStart };
  }, [eventData, timeRanges, timeZone, weekStart]);

  // Create the calendar once; later changes are pushed into it below.
  useEffect(() => {
    let cancelled = false;
    loadBryntum()
      .then(({ Calendar }) => {
        if (cancelled || !hostRef.current) return;
        const data = initial.current;
        calendarRef.current = new Calendar({
          appendTo: hostRef.current,
          date: new Date(data.weekStart),
          mode: "week",
          modes: {
            day: true,
            week: { hourHeight: 64 },
            month: true,
            year: false,
            agenda: true,
          },
          timeZone: data.timeZone,
          weekStartDay: 1,
          readOnly: true,
          autoCreate: false,
          sidebar: false,
          events: data.eventData,
          timeRanges: data.timeRanges,
          features: {
            // A full-width wash behind the allowed hours (1 = the whole day
            // column) instead of Bryntum's narrow labelled bar; the legend
            // beside the calendar explains it.
            timeRanges: {
              headerWidth: 1,
              showHeaderElements: false,
              showCurrentTimeLine: true,
            },
            eventEdit: false,
            drag: false,
            eventMenu: false,
            scheduleMenu: false,
            eventTooltip: false,
          },
          listeners: {
            eventClick: ({ eventRecord }: { eventRecord: EventModel }) =>
              onSelectRef.current(String(eventRecord.id)),
          },
        } as CalendarConfig);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      calendarRef.current?.destroy();
      calendarRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (calendarRef.current) calendarRef.current.events = eventData;
  }, [eventData]);

  useEffect(() => {
    if (calendarRef.current) calendarRef.current.timeRanges = timeRanges;
  }, [timeRanges]);

  return (
    <div className="fp-calendar" data-status={status}>
      <div ref={hostRef} className="fp-calendar__host" />
      {status === "loading" ? (
        <div className="skeleton fp-calendar-skeleton" aria-label="Loading" />
      ) : null}
      {status === "error" ? (
        <p className="muted fp-calendar__error" role="alert">
          The calendar could not load. Events are listed alongside.
        </p>
      ) : null}
    </div>
  );
}
