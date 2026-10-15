import { describe, expect, it } from "vitest";

import { localDayRange, localMonthRange } from "../../src/domain/zoned-time";

const iso = (range: { start: Date; end: Date }) => [
  range.start.toISOString(),
  range.end.toISOString(),
];

describe("localDayRange", () => {
  it("uses UTC days for UTC", () => {
    expect(iso(localDayRange(new Date("2026-10-21T15:00:00Z"), "UTC"))).toEqual(
      ["2026-10-21T00:00:00.000Z", "2026-10-22T00:00:00.000Z"],
    );
  });

  it("shifts to the user's day in Lagos (UTC+1)", () => {
    // 23:30 UTC on the 21st is already 00:30 on the 22nd in Lagos.
    expect(
      iso(localDayRange(new Date("2026-10-21T23:30:00Z"), "Africa/Lagos")),
    ).toEqual(["2026-10-21T23:00:00.000Z", "2026-10-22T23:00:00.000Z"]);
  });

  it("handles a 25-hour day when daylight saving ends", () => {
    // New York leaves DST on 1 Nov 2026: midnight is UTC-4, next is UTC-5.
    expect(
      iso(localDayRange(new Date("2026-11-01T12:00:00Z"), "America/New_York")),
    ).toEqual(["2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z"]);
  });

  it("rolls over month ends", () => {
    expect(iso(localDayRange(new Date("2026-10-31T12:00:00Z"), "UTC"))[1]).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });
});

describe("localMonthRange", () => {
  it("covers the user's calendar month", () => {
    expect(
      iso(localMonthRange(new Date("2026-10-21T12:00:00Z"), "Africa/Lagos")),
    ).toEqual(["2026-09-30T23:00:00.000Z", "2026-10-31T23:00:00.000Z"]);
  });

  it("rolls December into January", () => {
    expect(
      iso(localMonthRange(new Date("2026-12-15T12:00:00Z"), "UTC")),
    ).toEqual(["2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"]);
  });
});
