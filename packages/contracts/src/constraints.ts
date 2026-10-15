import { z } from "zod";

export const weekdaySchema = z.enum([
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
]);

export type Weekday = z.infer<typeof weekdaySchema>;

/** 24-hour local time, "HH:MM". */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM.");

/**
 * Spending is allowed on `days` from `start` (inclusive) to `end`
 * (exclusive), in the user's timezone. When `end` is earlier than `start`
 * the window runs past midnight into the next day, e.g. FRI 22:00-02:00.
 */
export const timeWindowSchema = z
  .object({
    days: z.array(weekdaySchema).min(1, "Pick at least one day."),
    start: timeOfDaySchema,
    end: timeOfDaySchema,
  })
  .refine((window) => window.start !== window.end, {
    message: "Start and end must differ.",
    path: ["end"],
  });

export type TimeWindow = z.infer<typeof timeWindowSchema>;

const capSchema = z.number().positive().max(1_000_000);

/** Caps are inclusive: spending exactly the cap is allowed. */
export const amountCapsSchema = z.object({
  perPurchase: capSchema,
  daily: capSchema.optional(),
  monthly: capSchema.optional(),
});

export type AmountCaps = z.infer<typeof amountCapsSchema>;

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const spendingConstraintsSchema = z.object({
  timezone: z.string().refine(isTimeZone, "Unknown timezone."),
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  /** Empty means no time restriction. */
  timeWindows: z.array(timeWindowSchema).max(14),
  amountCaps: amountCapsSchema,
});

export type SpendingConstraints = z.infer<typeof spendingConstraintsSchema>;
export type SpendingConstraintsInput = z.input<
  typeof spendingConstraintsSchema
>;

export const constraintReasonCodeSchema = z.enum([
  "OUTSIDE_TIME_WINDOW",
  "CURRENCY_MISMATCH",
  "OVER_PER_PURCHASE_CAP",
  "OVER_DAILY_CAP",
  "OVER_MONTHLY_CAP",
]);

export type ConstraintReasonCode = z.infer<typeof constraintReasonCodeSchema>;

/**
 * Matches the two separate inputs of the decision table: `constraints`
 * (time windows and currency) and `amount` (caps).
 */
export const constraintCheckSchema = z.object({
  constraints: z.enum(["PASS", "FAIL"]),
  amount: z.enum(["UNDER_CAP", "OVER_CAP"]),
  reasons: z.array(
    z.object({ code: constraintReasonCodeSchema, message: z.string() }),
  ),
});

export type ConstraintCheck = z.infer<typeof constraintCheckSchema>;
