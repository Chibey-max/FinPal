"use client";

import type { SpendingConstraints, Weekday } from "@finpal/contracts";
import {
  startTransition,
  useActionState,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { useToast } from "@/components/toast";
import { Select } from "@/components/ui/select";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { formatMoney } from "@/features/app/present";

import { saveConstraints, type SaveConstraintsState } from "./actions";

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

const amount = (value: number | undefined) =>
  value === undefined ? "" : value.toFixed(2);
const optional = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

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
  const extraWindows = initial?.timeWindows.slice(1) ?? [];

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

  useEffect(() => {
    if (state.message)
      toast(state.message, state.status === "error" ? "bad" : "ok");
  }, [state.at, state.message, state.status, toast]);

  const crosses = end < start;
  const windowNote = crosses
    ? `Window crosses midnight: allowed from ${start} until ${end} the next day.`
    : `Allowed from ${start} up to, not including, ${end}.`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() =>
      action(
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
      ),
    );
  }

  const zones = timeZones.includes(timezone)
    ? timeZones
    : [timezone, ...timeZones];

  return (
    <form className="constraints-form" onSubmit={submit} noValidate>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Constraints</h1>
          <p>
            When and how much FinPal may spend. Applied to every new proposal.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          className="enforce-toggle"
          onClick={() => setEnabled((value) => !value)}
        >
          <span
            className="enforce-toggle__track"
            data-on={enabled || undefined}
          >
            <span />
          </span>
          {enabled ? "Enforced" : "Not configured"}
        </button>
      </div>

      {!enabled ? (
        <p className="notice fade-in" data-tone="warn">
          No constraints configured. This is not unrestricted permission: every
          proposal goes to manual review.
        </p>
      ) : null}

      <fieldset
        className="card constraints-card"
        disabled={!enabled}
        data-off={!enabled || undefined}
      >
        <legend className="eyebrow">Allowed time window</legend>
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
                Boolean(errors["amountCaps.perPurchase"]) || undefined
              }
            />
            <FieldError message={errors["amountCaps.perPurchase"]} />
          </label>
          <label className="field">
            <span>Daily</span>
            <input
              className="input input--inset mono"
              inputMode="decimal"
              value={daily}
              placeholder="No cap"
              onChange={(e) => setDaily(e.target.value)}
              aria-invalid={Boolean(errors["amountCaps.daily"]) || undefined}
            />
            <FieldError message={errors["amountCaps.daily"]} />
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
          {formatMoney(spentThisMonth, currency)} this month. Currency
          mismatches fail closed; FinPal never converts.
        </span>
      </fieldset>

      <LiquidButton
        type="submit"
        size="xl"
        className="self-start rounded-full"
        disabled={pending}
      >
        {pending ? <span className="spinner" aria-hidden /> : null}
        {pending ? "Saving…" : "Save constraints"}
      </LiquidButton>
    </form>
  );
}
