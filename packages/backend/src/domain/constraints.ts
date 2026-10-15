import type {
  ConstraintCheck,
  SpendingConstraints,
  TimeWindow,
  Weekday,
} from "@finpal/contracts";

export interface ConstraintCheckInput {
  constraints: SpendingConstraints;
  amount: number;
  currency: string;
  /** When the purchase would happen: the proposal's date, or now. */
  at: Date;
  /** Already authorized or captured today / this month, in the user's timezone. */
  spentToday?: number;
  spentThisMonth?: number;
}

const weekdays: Record<string, Weekday> = {
  Mon: "MON",
  Tue: "TUE",
  Wed: "WED",
  Thu: "THU",
  Fri: "FRI",
  Sat: "SAT",
  Sun: "SUN",
};

const nextDay: Record<Weekday, Weekday> = {
  MON: "TUE",
  TUE: "WED",
  WED: "THU",
  THU: "FRI",
  FRI: "SAT",
  SAT: "SUN",
  SUN: "MON",
};

/** Weekday and minutes since midnight of `at` in `timeZone`. */
export function localTime(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;

  return {
    day: weekdays[part("weekday") ?? ""]!,
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

// Start is inclusive and end exclusive, so back-to-back windows never overlap.
function isInWindow(window: TimeWindow, day: Weekday, minutes: number) {
  const start = toMinutes(window.start);
  const end = toMinutes(window.end);

  if (start < end) {
    return window.days.includes(day) && minutes >= start && minutes < end;
  }
  // Overnight window: the late part on a listed day, the early part on the
  // following day (FRI 22:00-02:00 covers Saturday 00:00-02:00).
  return (
    (window.days.includes(day) && minutes >= start) ||
    (window.days.some((listed) => nextDay[listed] === day) && minutes < end)
  );
}

/** True when `at` falls inside any window. No windows means no restriction. */
export function isWithinTimeWindows(
  windows: readonly TimeWindow[],
  at: Date,
  timeZone: string,
) {
  if (windows.length === 0) return true;
  const { day, minutes } = localTime(at, timeZone);
  return windows.some((window) => isInWindow(window, day, minutes));
}

// Compare money in integer minor units so 0.1 + 0.2 never exceeds a 0.30 cap.
const toMinor = (amount: number) => Math.round(amount * 100);

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount,
  );
}

export function checkConstraints(input: ConstraintCheckInput): ConstraintCheck {
  const { constraints, amount, currency, at } = input;
  const reasons: ConstraintCheck["reasons"] = [];

  // Caps cannot be compared across currencies, so a mismatch fails closed on
  // both dimensions rather than guessing an exchange rate.
  if (currency.toUpperCase() !== constraints.currency) {
    return {
      constraints: "FAIL",
      amount: "OVER_CAP",
      reasons: [
        {
          code: "CURRENCY_MISMATCH",
          message: `Proposal is in ${currency.toUpperCase()} but your limits are in ${constraints.currency}.`,
        },
      ],
    };
  }

  const withinWindow = isWithinTimeWindows(
    constraints.timeWindows,
    at,
    constraints.timezone,
  );
  if (!withinWindow) {
    reasons.push({
      code: "OUTSIDE_TIME_WINDOW",
      message: "This purchase falls outside your allowed spending times.",
    });
  }

  const caps = constraints.amountCaps;
  const price = toMinor(amount);
  let overCap = false;

  if (price > toMinor(caps.perPurchase)) {
    overCap = true;
    reasons.push({
      code: "OVER_PER_PURCHASE_CAP",
      message: `${formatMoney(amount, currency)} is over your per-purchase cap of ${formatMoney(caps.perPurchase, currency)}.`,
    });
  }
  if (
    caps.daily !== undefined &&
    toMinor(input.spentToday ?? 0) + price > toMinor(caps.daily)
  ) {
    overCap = true;
    reasons.push({
      code: "OVER_DAILY_CAP",
      message: `This would take today's spending over your daily cap of ${formatMoney(caps.daily, currency)}.`,
    });
  }
  if (
    caps.monthly !== undefined &&
    toMinor(input.spentThisMonth ?? 0) + price > toMinor(caps.monthly)
  ) {
    overCap = true;
    reasons.push({
      code: "OVER_MONTHLY_CAP",
      message: `This would take this month's spending over your monthly cap of ${formatMoney(caps.monthly, currency)}.`,
    });
  }

  return {
    constraints: withinWindow ? "PASS" : "FAIL",
    amount: overCap ? "OVER_CAP" : "UNDER_CAP",
    reasons,
  };
}
