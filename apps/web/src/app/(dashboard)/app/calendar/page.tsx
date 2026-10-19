import {
  CalendarWeek,
  type CalendarDay,
} from "@/features/calendar/calendar-week";
import { requireUser } from "@/lib/auth";
import { getCalendarEvents, getUserConstraints } from "@/lib/backend";
import { addDays, localDate, localWeekday, zonedToDate } from "@/lib/zoned";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday of the coming week (today, if today is Monday) in the zone. */
function weekStart(timeZone: string) {
  const now = new Date();
  const today = localDate(now, timeZone);
  const index = WEEKDAYS.indexOf(localWeekday(now, timeZone));
  return index <= 0 ? today : addDays(today, 7 - index);
}

export default async function CalendarPage() {
  const user = await requireUser();
  const constraints = await getUserConstraints(user.id);
  const timeZone = constraints?.timezone ?? "America/Los_Angeles";
  const { events, configured } = await getCalendarEvents();
  const monday = weekStart(timeZone);
  const days: CalendarDay[] = WEEKDAYS.map((dow, index) => {
    const date = addDays(monday, index);
    return { date, dow, num: String(Number(date.slice(8, 10))) };
  });
  const weekLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(zonedToDate(monday, "12:00", timeZone));

  return (
    <div className="app-page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Calendar</h1>
          <p>
            Week of {weekLabel}. Events can prefill a proposal&apos;s context
            and time. They never create a product, price or payment.
          </p>
        </div>
      </div>
      <CalendarWeek
        days={days}
        events={events}
        configured={configured}
        timeZone={timeZone}
      />
    </div>
  );
}
