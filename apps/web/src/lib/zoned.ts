// Wall-clock helpers for a named IANA timezone. Shared by server and client:
// spending windows are evaluated in the user's constraints timezone, not the
// browser's, so form times must be converted in that zone.

function parts(at: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) =>
    values.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"),
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "YYYY-MM-DD" of `at` in the zone. */
export function localDate(at: Date, timeZone: string) {
  const p = parts(at, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:MM" of `at` in the zone. */
export function localTimeOfDay(at: Date, timeZone: string) {
  const p = parts(at, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Short weekday ("Mon") of `at` in the zone. */
export function localWeekday(at: Date, timeZone: string) {
  return parts(at, timeZone).weekday;
}

function offsetMs(at: Date, timeZone: string) {
  const p = parts(at, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant when the zone's wall clock reads `date` `time`. */
export function zonedToDate(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClock = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  // Two passes settle the offset next to a DST change.
  let instant = wallClock - offsetMs(new Date(wallClock), timeZone);
  instant = wallClock - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Adds whole days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}
