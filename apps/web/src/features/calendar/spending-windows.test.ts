import { describe, expect, it } from "vitest";

import { spendingRanges, weekdayOf } from "./spending-windows";

describe("spending windows", () => {
  it("knows the weekday of a calendar date", () => {
    expect(weekdayOf("2026-10-19")).toBe("MON");
    expect(weekdayOf("2026-10-25")).toBe("SUN");
  });

  it("creates one range per allowed day, in the user's timezone", () => {
    const ranges = spendingRanges(
      [{ days: ["MON", "WED"], start: "08:00", end: "22:00" }],
      "2026-10-19",
      7,
      "America/Los_Angeles",
    );
    expect(ranges).toHaveLength(2);
    // 08:00 PDT is 15:00 UTC.
    expect(ranges[0]!.startDate.toISOString()).toBe("2026-10-19T15:00:00.000Z");
    expect(ranges[0]!.endDate.toISOString()).toBe("2026-10-20T05:00:00.000Z");
    expect(ranges[1]!.id).toBe("2026-10-21-0");
  });

  it("runs a window that ends before it starts into the next day", () => {
    const [range] = spendingRanges(
      [{ days: ["FRI"], start: "22:00", end: "02:00" }],
      "2026-10-23",
      1,
      "UTC",
    );
    expect(range!.startDate.toISOString()).toBe("2026-10-23T22:00:00.000Z");
    expect(range!.endDate.toISOString()).toBe("2026-10-24T02:00:00.000Z");
  });

  it("shades nothing without windows", () => {
    expect(spendingRanges([], "2026-10-19", 7, "UTC")).toEqual([]);
  });
});
