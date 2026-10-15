import type { SpendingConstraints, TimeWindow } from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import {
  checkConstraints,
  isWithinTimeWindows,
  localTime,
} from "../../src/domain/constraints";

// 2026-10-16 is a Friday.
const utc = (iso: string) => new Date(`${iso}Z`);

const weekdayEvenings: TimeWindow = {
  days: ["MON", "TUE", "WED", "THU", "FRI"],
  start: "18:00",
  end: "22:00",
};

const constraints: SpendingConstraints = {
  timezone: "UTC",
  currency: "USD",
  timeWindows: [weekdayEvenings],
  amountCaps: { perPurchase: 100, daily: 150, monthly: 500 },
};

const insideWindow = utc("2026-10-16T19:00:00");

function check(
  overrides: Partial<Parameters<typeof checkConstraints>[0]> = {},
) {
  return checkConstraints({
    constraints,
    amount: 50,
    currency: "USD",
    at: insideWindow,
    ...overrides,
  });
}

describe("localTime", () => {
  it("converts to the user's timezone, including the date change", () => {
    // 23:30 UTC Friday is 00:30 Saturday in Lagos (UTC+1).
    expect(localTime(utc("2026-10-16T23:30:00"), "Africa/Lagos")).toEqual({
      day: "SAT",
      minutes: 30,
    });
  });

  it("follows daylight saving time", () => {
    // New York is UTC-4 in October and UTC-5 in December.
    expect(
      localTime(utc("2026-10-16T22:00:00"), "America/New_York").minutes,
    ).toBe(18 * 60);
    expect(
      localTime(utc("2026-12-04T22:00:00"), "America/New_York").minutes,
    ).toBe(17 * 60);
  });

  it("reports midnight as minute 0", () => {
    expect(localTime(utc("2026-10-16T00:00:00"), "UTC")).toEqual({
      day: "FRI",
      minutes: 0,
    });
  });
});

describe("isWithinTimeWindows", () => {
  const within = (iso: string, windows = [weekdayEvenings], tz = "UTC") =>
    isWithinTimeWindows(windows, utc(iso), tz);

  it("allows any time when no windows are set", () => {
    expect(within("2026-10-17T03:00:00", [])).toBe(true);
  });

  it("includes the start minute and excludes the end minute", () => {
    expect(within("2026-10-16T17:59:00")).toBe(false);
    expect(within("2026-10-16T18:00:00")).toBe(true);
    expect(within("2026-10-16T21:59:00")).toBe(true);
    expect(within("2026-10-16T22:00:00")).toBe(false);
  });

  it("only applies on the listed days", () => {
    expect(within("2026-10-17T19:00:00")).toBe(false); // Saturday
  });

  it("supports windows that cross midnight", () => {
    const fridayNight: TimeWindow = {
      days: ["FRI"],
      start: "22:00",
      end: "02:00",
    };

    expect(within("2026-10-16T21:59:00", [fridayNight])).toBe(false);
    expect(within("2026-10-16T23:00:00", [fridayNight])).toBe(true); // Fri late
    expect(within("2026-10-17T01:59:00", [fridayNight])).toBe(true); // Sat early
    expect(within("2026-10-17T02:00:00", [fridayNight])).toBe(false);
    expect(within("2026-10-17T23:00:00", [fridayNight])).toBe(false); // Sat late
    expect(within("2026-10-16T01:00:00", [fridayNight])).toBe(false); // Fri early
  });

  it("wraps a SUN overnight window into Monday", () => {
    const sundayNight: TimeWindow = {
      days: ["SUN"],
      start: "23:00",
      end: "01:00",
    };
    expect(within("2026-10-19T00:30:00", [sundayNight])).toBe(true); // Monday
  });

  it("passes when any one of several windows matches", () => {
    const weekendMornings: TimeWindow = {
      days: ["SAT", "SUN"],
      start: "09:00",
      end: "12:00",
    };
    expect(
      within("2026-10-17T10:00:00", [weekdayEvenings, weekendMornings]),
    ).toBe(true);
  });

  it("evaluates windows in the user's timezone", () => {
    // 17:30 UTC is 18:30 in Lagos: inside the 18:00-22:00 window there only.
    expect(within("2026-10-16T17:30:00", [weekdayEvenings], "UTC")).toBe(false);
    expect(
      within("2026-10-16T17:30:00", [weekdayEvenings], "Africa/Lagos"),
    ).toBe(true);
  });
});

describe("checkConstraints", () => {
  it("passes a purchase inside the window and under every cap", () => {
    expect(check()).toEqual({
      constraints: "PASS",
      amount: "UNDER_CAP",
      reasons: [],
    });
  });

  it("fails constraints outside the time window but keeps the amount result", () => {
    const result = check({ at: utc("2026-10-17T19:00:00") });
    expect(result.constraints).toBe("FAIL");
    expect(result.amount).toBe("UNDER_CAP");
    expect(result.reasons.map((r) => r.code)).toEqual(["OUTSIDE_TIME_WINDOW"]);
  });

  describe("per-purchase cap", () => {
    it("allows exactly the cap", () => {
      expect(check({ amount: 100 }).amount).toBe("UNDER_CAP");
    });

    it("blocks one cent over the cap", () => {
      const result = check({ amount: 100.01 });
      expect(result.amount).toBe("OVER_CAP");
      expect(result.reasons[0]).toMatchObject({
        code: "OVER_PER_PURCHASE_CAP",
        message: "$100.01 is over your per-purchase cap of $100.00.",
      });
    });

    it("is not fooled by floating-point error", () => {
      const tight = {
        ...constraints,
        amountCaps: { perPurchase: 0.3 },
      };
      expect(check({ constraints: tight, amount: 0.1 + 0.2 }).amount).toBe(
        "UNDER_CAP",
      );
    });
  });

  describe("daily and monthly caps", () => {
    it("adds today's spending to the purchase", () => {
      expect(check({ amount: 50, spentToday: 100 }).amount).toBe("UNDER_CAP");
      const result = check({ amount: 50, spentToday: 100.01 });
      expect(result.amount).toBe("OVER_CAP");
      expect(result.reasons.map((r) => r.code)).toEqual(["OVER_DAILY_CAP"]);
    });

    it("adds this month's spending to the purchase", () => {
      const result = check({ amount: 50, spentThisMonth: 460 });
      expect(result.reasons.map((r) => r.code)).toEqual(["OVER_MONTHLY_CAP"]);
    });

    it("ignores caps that are not set", () => {
      const perPurchaseOnly = {
        ...constraints,
        amountCaps: { perPurchase: 100 },
      };
      expect(
        check({
          constraints: perPurchaseOnly,
          spentToday: 10_000,
          spentThisMonth: 10_000,
        }).amount,
      ).toBe("UNDER_CAP");
    });

    it("reports every cap that is exceeded", () => {
      const result = check({
        amount: 120,
        spentToday: 100,
        spentThisMonth: 450,
      });
      expect(result.reasons.map((r) => r.code)).toEqual([
        "OVER_PER_PURCHASE_CAP",
        "OVER_DAILY_CAP",
        "OVER_MONTHLY_CAP",
      ]);
    });
  });

  it("fails closed on a currency mismatch", () => {
    expect(check({ currency: "EUR" })).toEqual({
      constraints: "FAIL",
      amount: "OVER_CAP",
      reasons: [
        {
          code: "CURRENCY_MISMATCH",
          message: "Proposal is in EUR but your limits are in USD.",
        },
      ],
    });
  });

  it("compares currency codes case-insensitively", () => {
    expect(check({ currency: "usd" }).constraints).toBe("PASS");
  });
});
