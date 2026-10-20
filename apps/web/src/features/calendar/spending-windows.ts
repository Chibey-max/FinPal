import type { TimeWindow, Weekday } from "@finpal/contracts";

import { addDays, zonedToDate } from "@/lib/zoned";

const WEEKDAYS: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Weekday of a "YYYY-MM-DD" calendar date (no timezone involved). */
export function weekdayOf(date: string): Weekday {
  const [year, month, day] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()]!;
}

export interface SpendingRange {
  /** Stable id: date plus window index. */
  id: string;
  startDate: Date;
  endDate: Date;
}

/**
 * The concrete periods when spending is allowed, from `firstDate` for `days`
 * days, as instants in `timeZone`. Mirrors the backend rule: start
 * inclusive, end exclusive, and a window whose end is earlier than its start
 * runs past midnight into the next day. Used only to shade the calendar;
 * the backend still decides every proposal.
 */
export function spendingRanges(
  windows: readonly TimeWindow[],
  firstDate: string,
  days: number,
  timeZone: string,
): SpendingRange[] {
  const ranges: SpendingRange[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(firstDate, offset);
    const weekday = weekdayOf(date);
    windows.forEach((window, index) => {
      if (!window.days.includes(weekday)) return;
      const crossesMidnight = window.end < window.start;
      ranges.push({
        id: `${date}-${index}`,
        startDate: zonedToDate(date, window.start, timeZone),
        endDate: zonedToDate(
          crossesMidnight ? addDays(date, 1) : date,
          window.end,
          timeZone,
        ),
      });
    });
  }
  return ranges;
}
