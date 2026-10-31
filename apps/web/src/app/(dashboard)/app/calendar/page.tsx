import { FlashToast } from "@/components/toast";
import { CalendarWeek } from "@/features/calendar/calendar-week";
import { requireUser } from "@/lib/auth";
import {
  getCalendarConnectionService,
  getCalendarEvents,
  getUserConstraints,
} from "@/lib/backend";
import { addDays, localDate, localWeekday, zonedToDate } from "@/lib/zoned";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday of the coming week (today, if today is Monday) in the zone. */
function weekStart(timeZone: string) {
  const now = new Date();
  const today = localDate(now, timeZone);
  const index = WEEKDAYS.indexOf(localWeekday(now, timeZone));
  return index <= 0 ? today : addDays(today, 7 - index);
}

const NOTICES: Record<string, { message: string; tone: "ok" | "bad" }> = {
  connected: { message: "Google Calendar connected.", tone: "ok" },
  disconnected: { message: "Google Calendar disconnected.", tone: "ok" },
  denied: { message: "Google Calendar wasn't connected.", tone: "bad" },
  failed: {
    message: "Google Calendar couldn't be connected. Try again.",
    tone: "bad",
  },
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>;
}) {
  const user = await requireUser();
  const { calendar } = await searchParams;
  const notice = calendar ? NOTICES[calendar] : undefined;
  const [constraints, page] = await Promise.all([
    getUserConstraints(user.id),
    getCalendarEvents(user.id, 50),
  ]);
  const timeZone = constraints?.timezone ?? "UTC";
  const monday = weekStart(timeZone);

  return (
    <div className="app-page">
      {notice ? (
        <FlashToast message={notice.message} tone={notice.tone} />
      ) : null}
      <div className="page-head__text">
        <h1>Calendar</h1>
        <p>
          Your events and the hours the agent may spend. Upcoming events help it
          suggest what you might need.
        </p>
      </div>
      <CalendarWeek
        events={page.events}
        windows={constraints?.timeWindows ?? []}
        configured={page.configured}
        needsReconnect={page.needsReconnect}
        canConnect={getCalendarConnectionService() !== null}
        timeZone={timeZone}
        weekStart={zonedToDate(monday, "12:00", timeZone).toISOString()}
        firstDate={monday}
      />
    </div>
  );
}
