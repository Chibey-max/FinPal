"use client";

import {
  capsOrderProblem,
  type DraftConstraintsResult,
  SpendingConstraints,
  SpendingConstraintsInput,
  Weekday,
} from "@finpal/contracts";
import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";

import { useToast } from "@/components/toast";
import { Select } from "@/components/ui/select";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { formatMoney } from "@/features/app/present";

import { saveConstraints, type SaveConstraintsState } from "./actions";
import { RulesDescriber } from "./rules-describer";

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: "MON", label: "Mon" },
  { value: "TUE", label: "Tue" },
  { value: "WED", label: "Wed" },
  { value: "THU", label: "Thu" },
  { value: "FRI", label: "Fri" },
  { value: "SAT", label: "Sat" },
  { value: "SUN", label: "Sun" },
];
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];
const EVERY_DAY: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const PRESETS = [
  {
    label: "Careful",
    hint: "$50 a purchase, $100 a day, $500 a month, daytime",
    perPurchase: 50,
    daily: 100,
    monthly: 500,
    days: EVERY_DAY,
    start: "08:00",
    end: "20:00",
  },
  {
    label: "Everyday",
    hint: "$200 a purchase, $400 a day, $2,000 a month",
    perPurchase: 200,
    daily: 400,
    monthly: 2000,
    days: EVERY_DAY,
    start: "07:00",
    end: "23:00",
  },
  {
    label: "Big purchases",
    hint: "$1,000 a purchase, $1,500 a day, $5,000 a month, weekdays",
    perPurchase: 1000,
    daily: 1500,
    monthly: 5000,
    days: ["MON", "TUE", "WED", "THU", "FRI"] as Weekday[],
    start: "09:00",
    end: "18:00",
  },
];

const amount = (value: number | undefined) =>
  value === undefined ? "" : value.toFixed(2);
const optional = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

const dayOrder = new Map(
  WEEKDAYS.map((day, index) => [day.value, index] as const),
);

/** Compare the meaning of the form, not cosmetic number/day formatting. */
function constraintsSignature(input: SpendingConstraintsInput | null) {
  if (input === null) return "not-configured";
  return JSON.stringify({
    timezone: input.timezone,
    currency: input.currency.toUpperCase(),
    timeWindows: input.timeWindows.map((window) => ({
      ...window,
      days: [...window.days].sort(
        (a, b) => (dayOrder.get(a) ?? 0) - (dayOrder.get(b) ?? 0),
      ),
    })),
    amountCaps: {
      perPurchase: Number(input.amountCaps.perPurchase),
      daily:
        input.amountCaps.daily === undefined
          ? null
          : Number(input.amountCaps.daily),
      monthly:
        input.amountCaps.monthly === undefined
          ? null
          : Number(input.amountCaps.monthly),
    },
  });
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function ConstraintsForm({
  initial,
  timeZones,
  spentToday,
  spentThisMonth,
}: {
  initial: SpendingConstraints | null;
  timeZones: string[];
  spentToday: number;
  spentThisMonth: number;
}) {
  const toast = useToast();
  const [state, action, pending] = useActionState<
    SaveConstraintsState,
    Parameters<typeof saveConstraints>[1]
  >(saveConstraints, {});
  const first = initial?.timeWindows[0];
  const extraWindows = useMemo(
    () => initial?.timeWindows.slice(1) ?? [],
    [initial],
  );

  const [enabled, setEnabled] = useState(initial !== null);
  const [timezone, setTimezone] = useState(
    initial?.timezone ?? "America/Los_Angeles",
  );
  const [days, setDays] = useState<Weekday[]>(
    first?.days ?? WEEKDAYS.map((d) => d.value),
  );
  const [start, setStart] = useState(first?.start ?? "08:00");
  const [end, setEnd] = useState(first?.end ?? "22:00");
  const [perPurchase, setPerPurchase] = useState(
    amount(initial?.amountCaps.perPurchase ?? 500),
  );
  const [daily, setDaily] = useState(
    amount(initial?.amountCaps.daily ?? (initial ? undefined : 800)),
  );
  const [monthly, setMonthly] = useState(
    amount(initial?.amountCaps.monthly ?? (initial ? undefined : 2500)),
  );
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const errors = state.fieldErrors ?? {};

  const currentInput = useMemo<SpendingConstraintsInput | null>(
    () =>
      enabled
        ? {
            timezone,
            currency,
            timeWindows: [{ days, start, end }, ...extraWindows],
            amountCaps: {
              perPurchase: Number(perPurchase),
              daily: optional(daily),
              monthly: optional(monthly),
            },
          }
        : null,
    [
      currency,
      daily,
      days,
      enabled,
      end,
      extraWindows,
      monthly,
      perPurchase,
      start,
      timezone,
    ],
  );
  const currentSignature = constraintsSignature(currentInput);
  const initialSignature = useMemo(
    () => constraintsSignature(initial),
    [initial],
  );
  const savedSignature =
    state.saved === undefined
      ? initialSignature
      : constraintsSignature(state.saved);
  const isDirty = currentSignature !== savedSignature;

  useEffect(() => {
    if (state.message) {
      toast(state.message, state.status === "error" ? "bad" : "ok");
    }
  }, [state.at, state.message, state.status, toast]);

  function applyDraft({ draft }: DraftConstraintsResult) {
    setEnabled(true);
    if (draft.currency) setCurrency(draft.currency);
    if (draft.perPurchase !== null) setPerPurchase(amount(draft.perPurchase));
    if (draft.daily !== null) setDaily(amount(draft.daily));
    if (draft.monthly !== null) setMonthly(amount(draft.monthly));
    const window = draft.timeWindows?.[0];
    if (window) {
      setDays(window.days);
      setStart(window.start);
      setEnd(window.end);
    }
  }

  const capsProblem = enabled
    ? capsOrderProblem({
        perPurchase: optional(perPurchase),
        daily: optional(daily),
        monthly: optional(monthly),
      })
    : null;
  const capsMessage = (field: "perPurchase" | "daily") =>
    capsProblem?.field === field ? capsProblem.message : undefined;

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setEnabled(true);
    setPerPurchase(amount(preset.perPurchase));
    setDaily(amount(preset.daily));
    setMonthly(amount(preset.monthly));
    setDays(preset.days);
    setStart(preset.start);
    setEnd(preset.end);
  }

  const crosses = end < start;
  const windowNote = crosses
    ? `Window crosses midnight: allowed from ${start} until ${end} the next day.`
    : `Allowed from ${start} up to, not including, ${end}.`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDirty || pending || capsProblem) return;
    startTransition(() => action(currentInput));
  }

  const zones = timeZones.includes(timezone)
    ? timeZones
    : [timezone, ...timeZones];

  return (
    <form className="constraints-form" onSubmit={submit} noValidate>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Rules</h1>
          <p>
            How much and when the agent may spend. Purchases inside your rules
            only need your one approval.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          className="enforce-toggle"
          onClick={() => setEnabled((value) => !value)}
          disabled={pending}
        >
          <span
            className="enforce-toggle__track"
            data-on={enabled || undefined}
          >
            <span />
          </span>
          {enabled ? "On" : "Off"}
        </button>
      </div>

      <div className="field-group">
        <span className="eyebrow">Start from a preset</span>
        <div className="preset-row">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="preset"
              title={preset.hint}
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <RulesDescriber onDraft={applyDraft} />

      {!enabled ? (
        <p className="notice fade-in" data-tone="warn">
          Rules are off. That doesn&apos;t give the agent a free hand:
          you&apos;ll review everything it finds.
        </p>
      ) : null}

      <fieldset
        className="card constraints-card"
        disabled={!enabled}
        data-off={!enabled || undefined}
      >
        <legend className="eyebrow">When the agent can spend</legend>
        <div className="field-grid">
          <label className="field">
            <span>Timezone</span>
            <Select
              className="input input--inset"
              value={timezone}
              onChange={setTimezone}
              options={zones}
              invalid={Boolean(errors.timezone)}
            />
            <FieldError message={errors.timezone} />
          </label>
          <label className="field">
            <span>Start (inclusive)</span>
            <input
              className="input input--inset mono"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value || "00:00")}
            />
          </label>
          <label className="field">
            <span>End (exclusive)</span>
            <input
              className="input input--inset mono"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value || "00:00")}
            />
            <FieldError message={errors["timeWindows.0.end"]} />
          </label>
        </div>
        <div className="day-chips" role="group" aria-label="Days">
          {WEEKDAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              aria-pressed={days.includes(day.value)}
              onClick={() =>
                setDays((current) =>
                  current.includes(day.value)
                    ? current.filter((d) => d !== day.value)
                    : [...current, day.value],
                )
              }
            >
              {day.label}
            </button>
          ))}
        </div>
        <FieldError message={errors["timeWindows.0.days"]} />
        <span className="small ink4">
          {windowNote}
          {extraWindows.length
            ? ` ${extraWindows.length} more window${extraWindows.length > 1 ? "s are" : " is"} kept unchanged.`
            : ""}
        </span>

        <span className="eyebrow card-divider">Amount caps (inclusive)</span>
        <div className="field-grid">
          <label className="field">
            <span>Per transaction</span>
            <input
              className="input input--inset mono"
              inputMode="decimal"
              value={perPurchase}
              onChange={(e) => setPerPurchase(e.target.value)}
              aria-invalid={
                Boolean(
                  capsMessage("perPurchase") ||
                  errors["amountCaps.perPurchase"],
                ) || undefined
              }
            />
            <FieldError
              message={
                capsMessage("perPurchase") ?? errors["amountCaps.perPurchase"]
              }
            />
          </label>
          <label className="field">
            <span>Daily</span>
            <input
              className="input input--inset mono"
              inputMode="decimal"
              value={daily}
              placeholder="No cap"
              onChange={(e) => setDaily(e.target.value)}
              aria-invalid={
                Boolean(capsMessage("daily") || errors["amountCaps.daily"]) ||
                undefined
              }
            />
            <FieldError
              message={capsMessage("daily") ?? errors["amountCaps.daily"]}
            />
          </label>
          <label className="field">
            <span>Monthly</span>
            <input
              className="input input--inset mono"
              inputMode="decimal"
              value={monthly}
              placeholder="No cap"
              onChange={(e) => setMonthly(e.target.value)}
              aria-invalid={Boolean(errors["amountCaps.monthly"]) || undefined}
            />
            <FieldError message={errors["amountCaps.monthly"]} />
          </label>
          <label className="field">
            <span>Currency</span>
            <Select
              className="input input--inset"
              value={currency}
              onChange={setCurrency}
              options={[...new Set([currency, ...CURRENCIES])]}
            />
          </label>
        </div>
        <span className="small ink4">
          Counted so far: {formatMoney(spentToday, currency)} today,{" "}
          {formatMoney(spentThisMonth, currency)} this month. A purchase in
          another currency is blocked; FinPal never converts.
        </span>
      </fieldset>

      <LiquidButton
        type="submit"
        size="xl"
        className="self-start rounded-full"
        disabled={pending || !isDirty || Boolean(capsProblem)}
        aria-describedby="constraints-save-hint"
      >
        {pending ? <span className="spinner" aria-hidden /> : null}
        {pending
          ? "Saving…"
          : !isDirty
            ? state.status === "saved"
              ? "Saved"
              : "No changes to save"
            : enabled
              ? "Save rules"
              : "Turn rules off"}
      </LiquidButton>
      <span id="constraints-save-hint" className="small ink4">
        {!isDirty
          ? enabled
            ? "Change a rule to enable saving."
            : "Turn rules on to set them."
          : capsProblem
            ? "Fix the budget above to save."
            : enabled
              ? "Your changes are not active until you save."
              : "Saving turns your rules off, so you'll review everything."}
      </span>
      {state.status === "saved" && !isDirty && state.saved ? (
        <div className="card rules-next fade-in">
          <span>Rules saved. What should the agent get you?</span>
          <LiquidButton asChild size="lg" className="rounded-full">
            <Link href="/app">Start shopping</Link>
          </LiquidButton>
        </div>
      ) : null}
    </form>
  );
}
