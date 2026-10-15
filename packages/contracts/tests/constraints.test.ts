import { describe, expect, it } from "vitest";

import { spendingConstraintsSchema } from "../src";

const valid = {
  timezone: "Africa/Lagos",
  currency: "usd",
  timeWindows: [{ days: ["MON", "FRI"], start: "18:00", end: "22:00" }],
  amountCaps: { perPurchase: 100, daily: 200 },
};

describe("spendingConstraintsSchema", () => {
  it("accepts valid constraints and uppercases the currency", () => {
    expect(spendingConstraintsSchema.parse(valid).currency).toBe("USD");
  });

  it("accepts no time windows (no time restriction)", () => {
    expect(
      spendingConstraintsSchema.safeParse({ ...valid, timeWindows: [] })
        .success,
    ).toBe(true);
  });

  it("accepts an overnight window", () => {
    const overnight = { days: ["FRI"], start: "22:00", end: "02:00" };
    expect(
      spendingConstraintsSchema.safeParse({
        ...valid,
        timeWindows: [overnight],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["an unknown timezone", { timezone: "Mars/Olympus" }],
    ["a missing per-purchase cap", { amountCaps: { daily: 100 } }],
    ["a zero cap", { amountCaps: { perPurchase: 0 } }],
    [
      "a window with no days",
      { timeWindows: [{ days: [], start: "09:00", end: "17:00" }] },
    ],
    [
      "a window with equal start and end",
      { timeWindows: [{ days: ["MON"], start: "09:00", end: "09:00" }] },
    ],
    [
      "an invalid time",
      { timeWindows: [{ days: ["MON"], start: "24:00", end: "09:00" }] },
    ],
    [
      "an unknown day",
      { timeWindows: [{ days: ["FUNDAY"], start: "09:00", end: "17:00" }] },
    ],
  ])("rejects %s", (_label, override) => {
    expect(
      spendingConstraintsSchema.safeParse({ ...valid, ...override }).success,
    ).toBe(false);
  });
});
