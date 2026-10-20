import { CalendarWeek } from "@/features/calendar/calendar-week";
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
  const { events, configured } = await getCalendarEvents(50);
  const monday = weekStart(timeZone);
  const mondayNoon = zonedToDate(monday, "12:00", timeZone);
  const weekLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(mondayNoon);

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
        events={events}
        windows={constraints?.timeWindows ?? []}
        configured={configured}
        timeZone={timeZone}
        weekStart={mondayNoon.toISOString()}
        firstDate={monday}
      />
    </div>
  );
}
