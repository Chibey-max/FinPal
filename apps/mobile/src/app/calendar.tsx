import type {
  CalendarEventsPage,
  SpendingConstraints,
} from "@finpal/contracts";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { Button, Notice } from "@/components/form";
import {
  Card,
  ErrorNotice,
  Eyebrow,
  Loading,
  Screen,
  Text,
  Title,
} from "@/components/ui";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { useApi } from "@/lib/use-api";
import {
  addDays,
  localDate,
  localTimeOfDay,
  localWeekday,
  zonedToDate,
} from "@/lib/zoned";
import { mono } from "@/theme";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Summary = { timezone: string; constraints: SpendingConstraints | null };

/** Monday of the coming week (today, if today is Monday) in the zone. */
function weekStart(timeZone: string) {
  const now = new Date();
  const today = localDate(now, timeZone);
  const index = WEEKDAYS.indexOf(localWeekday(now, timeZone));
  return index <= 0 ? today : addDays(today, 7 - index);
}

/** "Mon, Oct 26" for a "YYYY-MM-DD" date. */
function dayLabel(date: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(zonedToDate(date, "12:00", timeZone));
}

/**
 * The week ahead, day by day: when spending is allowed, and the calendar
 * events that can prefill a proposal. Events never create a product, price or
 * payment.
 */
export default function Calendar() {
  const router = useRouter();
  const { colors } = useTheme();
  const summary = useApi<Summary>("/api/v1/summary");
  const events = useApi<CalendarEventsPage>("/api/v1/calendar/events?limit=50");

  const refresh = () => {
    summary.refresh();
    events.refresh();
  };
  const refreshing = summary.refreshing || events.refreshing;
  const error = summary.error ?? events.error;

  if ((summary.loading || events.loading) && !error) {
    return (
      <Screen>
        <Title>Calendar</Title>
        <Loading />
      </Screen>
    );
  }
  if (error || !summary.data || !events.data) {
    return (
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Title>Calendar</Title>
        <ErrorNotice message={error ?? "No data."} onRetry={refresh} />
      </Screen>
    );
  }

  const timeZone = summary.data.constraints?.timezone ?? "America/Los_Angeles";
  const windows = summary.data.constraints?.timeWindows ?? [];
  const monday = weekStart(timeZone);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const byDate = new Map<string, CalendarEventsPage["events"]>();
  const later: CalendarEventsPage["events"] = [];
  for (const event of events.data.events) {
    const date = localDate(new Date(event.startsAt), timeZone);
    if (dates.includes(date)) {
      byDate.set(date, [...(byDate.get(date) ?? []), event]);
    } else {
      later.push(event);
    }
  }

  const eventRow = (event: CalendarEventsPage["events"][number]) => (
    <View
      key={event.id}
      style={{ flexDirection: "row", alignItems: "center", gap: s(12) }}
    >
      <Text
        style={{
          fontFamily: mono,
          fontSize: ms(12),
          color: colors.ink3,
          width: s(46),
        }}
      >
        {localTimeOfDay(new Date(event.startsAt), timeZone)}
      </Text>
      <Text style={{ flex: 1, fontSize: ms(14.5) }} numberOfLines={2}>
        {event.title}
      </Text>
      <Button
        label="Propose"
        variant="outline"
        onPress={() =>
          router.push({
            pathname: "/proposals/new",
            params: { event: event.id },
          })
        }
        style={{ minHeight: 34, paddingHorizontal: s(14) }}
      />
    </View>
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: s(8) }}>
        <Title>Calendar</Title>
        <Text
          style={{ color: colors.ink3, fontSize: ms(14), lineHeight: ms(21) }}
        >
          Week of {dayLabel(monday, timeZone)}. Events can prefill a proposal’s
          context and time. They never create a product, price or payment.
        </Text>
      </View>

      {!events.data.configured ? (
        <Notice tone="warn">
          Google Calendar isn’t connected on the server, so there are no events
          to show. Your spending windows are still listed below.
        </Notice>
      ) : null}

      {dates.map((date, i) => {
        const weekday = WEEKDAYS[i]!.toUpperCase();
        const todays = windows.filter((window) =>
          window.days.includes(weekday as never),
        );
        const open = todays.length
          ? todays
              .map(
                (window) =>
                  `${window.start}–${window.end}${window.end < window.start ? " +1" : ""}`,
              )
              .join(", ")
          : null;
        const dayEvents = byDate.get(date) ?? [];
        return (
          <Card key={date} style={{ gap: s(12) }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: s(10),
              }}
            >
              <Text style={{ fontSize: ms(16) }}>
                {dayLabel(date, timeZone)}
              </Text>
              <Text
                style={{
                  fontFamily: mono,
                  fontSize: ms(11),
                  color: windows.length
                    ? open
                      ? colors.tones.ok.color
                      : colors.ink4
                    : colors.tones.warn.color,
                }}
              >
                {windows.length
                  ? open
                    ? `spend ${open}`
                    : "spending closed"
                  : "no constraints"}
              </Text>
            </View>
            {dayEvents.length ? (
              dayEvents.map(eventRow)
            ) : (
              <Text style={{ color: colors.ink4, fontSize: ms(13) }}>
                No events.
              </Text>
            )}
          </Card>
        );
      })}

      {later.length ? (
        <>
          <Eyebrow>Later</Eyebrow>
          <Card style={{ gap: s(12) }}>
            {later.map((event) => (
              <View key={event.id} style={{ gap: s(6) }}>
                <Text style={{ color: colors.ink4, fontSize: ms(12) }}>
                  {dayLabel(
                    localDate(new Date(event.startsAt), timeZone),
                    timeZone,
                  )}
                </Text>
                {eventRow(event)}
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
