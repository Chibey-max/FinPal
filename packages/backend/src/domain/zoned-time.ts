// Calendar-day and calendar-month boundaries in a user's timezone, as UTC
// instants, so "spent today" means today where the user lives.

function localParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Milliseconds the zone is ahead of UTC at `at` (e.g. +1h for Lagos). */
function offsetMs(at: Date, timeZone: string) {
  const p = localParts(at, timeZone);
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

/** The UTC instant of local midnight on the given local date. */
function localMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
) {
  const wallClock = Date.UTC(year, month - 1, day);
  // Two passes settle the offset even when midnight is near a DST change.
  let instant = wallClock - offsetMs(new Date(wallClock), timeZone);
  instant = wallClock - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

export interface TimeRange {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

export function localDayRange(at: Date, timeZone: string): TimeRange {
  const { year, month, day } = localParts(at, timeZone);
  // Date.UTC normalizes day overflow, e.g. 31 Oct + 1 -> 1 Nov.
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: localMidnight(year, month, day, timeZone),
    end: localMidnight(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      timeZone,
    ),
  };
}

export function localMonthRange(at: Date, timeZone: string): TimeRange {
  const { year, month } = localParts(at, timeZone);
  const next = new Date(Date.UTC(year, month, 1));
  return {
    start: localMidnight(year, month, 1, timeZone),
    end: localMidnight(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      1,
      timeZone,
    ),
  };
}
