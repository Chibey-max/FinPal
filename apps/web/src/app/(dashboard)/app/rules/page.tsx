import { FlashToast } from "@/components/toast";
import { CalendarWeek } from "@/features/calendar/calendar-week";
import { ConstraintsForm } from "@/features/constraints/constraints-form";
import { requireUser } from "@/lib/auth";
import {
  getCalendarConnectionService,
  getCalendarEvents,
  getSpendSummary,
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

const CALENDAR_NOTICES: Record<
  string,
  { message: string; tone: "ok" | "bad" }
> = {
  connected: { message: "Google Calendar connected.", tone: "ok" },
  disconnected: { message: "Google Calendar disconnected.", tone: "ok" },
  denied: { message: "Google Calendar wasn't connected.", tone: "bad" },
  failed: {
    message: "Google Calendar couldn't be connected. Try again.",
    tone: "bad",
  },
};

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>;
}) {
  const user = await requireUser();
  const { calendar } = await searchParams;
  const notice = calendar ? CALENDAR_NOTICES[calendar] : undefined;
  const constraints = await getUserConstraints(user.id);
  const [spend, { events, configured, needsReconnect }] = await Promise.all([
    getSpendSummary(user.id, constraints),
    getCalendarEvents(user.id, 50),
  ]);
  const timeZone = constraints?.timezone ?? "America/Los_Angeles";
  const monday = weekStart(timeZone);

  return (
    <div className="app-page">
      {notice ? (
        <FlashToast message={notice.message} tone={notice.tone} />
      ) : null}
      <div className="rules-form">
        {/* No key: re-mounting on new values would drop the save result,
            so the "Rules saved" toast would never show. */}
        <ConstraintsForm
          initial={constraints}
          timeZones={Intl.supportedValuesOf("timeZone")}
          spentToday={spend.spentToday}
          spentThisMonth={spend.spentThisMonth}
        />
      </div>
      <div className="page-head__text">
        <h2>When the agent can spend</h2>
        <p>
          Shaded hours are allowed by your rules. Upcoming events help the agent
          suggest what you might need.
        </p>
      </div>
      <CalendarWeek
        events={events}
        windows={constraints?.timeWindows ?? []}
        configured={configured}
        needsReconnect={needsReconnect}
        canConnect={getCalendarConnectionService() !== null}
        timeZone={timeZone}
        weekStart={zonedToDate(monday, "12:00", timeZone).toISOString()}
        firstDate={monday}
      />
    </div>
  );
}
