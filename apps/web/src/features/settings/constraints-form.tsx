"use client";

import type {
  SpendingConstraints,
  SpendingConstraintsInput,
  Weekday,
} from "@finpal/contracts";
import { Plus, Trash2 } from "lucide-react";
import {
  startTransition,
  useActionState,
  useState,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { saveConstraints, type SaveConstraintsState } from "./actions";

const weekdays: { value: Weekday; label: string }[] = [
  { value: "MON", label: "Mon" },
  { value: "TUE", label: "Tue" },
  { value: "WED", label: "Wed" },
  { value: "THU", label: "Thu" },
  { value: "FRI", label: "Fri" },
  { value: "SAT", label: "Sat" },
  { value: "SUN", label: "Sun" },
];

// Currencies PayPal Sandbox supports that the team is likely to demo with.
const currencies = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"];

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

interface WindowDraft {
  key: number;
  days: Weekday[];
  start: string;
  end: string;
}

const optionalAmount = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-destructive text-xs">{message}</p> : null;
}

export function ConstraintsForm({
  initial,
  timeZones,
}: {
  initial: SpendingConstraints | null;
  timeZones: string[];
}) {
  const [state, formAction, pending] = useActionState<
    SaveConstraintsState,
    SpendingConstraintsInput
  >(saveConstraints, {});

  const [timezone, setTimezone] = useState(initial?.timezone ?? "UTC");
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [perPurchase, setPerPurchase] = useState(
    initial ? String(initial.amountCaps.perPurchase) : "",
  );
  const [daily, setDaily] = useState(
    initial?.amountCaps.daily?.toString() ?? "",
  );
  const [monthly, setMonthly] = useState(
    initial?.amountCaps.monthly?.toString() ?? "",
  );
  const [windows, setWindows] = useState<WindowDraft[]>(
    (initial?.timeWindows ?? []).map((window, key) => ({ ...window, key })),
  );
  const [nextKey, setNextKey] = useState(windows.length);

  const errors = state.fieldErrors ?? {};

  function updateWindow(key: number, patch: Partial<WindowDraft>) {
    setWindows((current) =>
      current.map((window) =>
        window.key === key ? { ...window, ...patch } : window,
      ),
    );
  }

  function toggleDay(window: WindowDraft, day: Weekday) {
    updateWindow(window.key, {
      days: window.days.includes(day)
        ? window.days.filter((d) => d !== day)
        : [...window.days, day],
    });
  }

  function addWindow() {
    setWindows((current) => [
      ...current,
      {
        key: nextKey,
        days: ["MON", "TUE", "WED", "THU", "FRI"],
        start: "09:00",
        end: "17:00",
      },
    ]);
    setNextKey((key) => key + 1);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() =>
      formAction({
        timezone,
        currency,
        timeWindows: windows.map(({ days, start, end }) => ({
          days,
          start,
          end,
        })),
        amountCaps: {
          perPurchase: Number(perPurchase),
          daily: optionalAmount(daily),
          monthly: optionalAmount(monthly),
        },
      }),
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-8">
      <section className="grid gap-4">
        <div>
          <h2 className="text-lg font-semibold">Spending caps</h2>
          <p className="text-muted-foreground text-sm">
            A purchase over any cap is blocked. Spending exactly the cap is
            allowed.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              className={selectClassName}
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <FieldError message={errors.currency} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="perPurchase">Per purchase (required)</Label>
            <Input
              id="perPurchase"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              value={perPurchase}
              onChange={(event) => setPerPurchase(event.target.value)}
              aria-invalid={Boolean(errors["amountCaps.perPurchase"])}
            />
            <FieldError message={errors["amountCaps.perPurchase"]} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="daily">Daily (optional)</Label>
            <Input
              id="daily"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={daily}
              onChange={(event) => setDaily(event.target.value)}
              aria-invalid={Boolean(errors["amountCaps.daily"])}
            />
            <FieldError message={errors["amountCaps.daily"]} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="monthly">Monthly (optional)</Label>
            <Input
              id="monthly"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={monthly}
              onChange={(event) => setMonthly(event.target.value)}
              aria-invalid={Boolean(errors["amountCaps.monthly"])}
            />
            <FieldError message={errors["amountCaps.monthly"]} />
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <div>
          <h2 className="text-lg font-semibold">Allowed spending times</h2>
          <p className="text-muted-foreground text-sm">
            Purchases outside these windows are blocked. Leave empty to allow
            any time. A window ending before it starts runs past midnight.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="timezone">Timezone</Label>
          <div className="flex gap-2">
            <select
              id="timezone"
              className={selectClassName}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
              }
            >
              Use mine
            </Button>
          </div>
          <FieldError message={errors.timezone} />
        </div>

        {windows.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
            No windows: spending is allowed at any time.
          </p>
        ) : null}

        {windows.map((window, index) => (
          <fieldset
            key={window.key}
            className="grid gap-3 rounded-md border p-4"
          >
            <legend className="px-1 text-sm font-medium">
              Window {index + 1}
            </legend>
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Days"
            >
              {weekdays.map(({ value, label }) => {
                const selected = window.days.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleDay(window, value)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-accent",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <FieldError message={errors[`timeWindows.${index}.days`]} />

            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <Label htmlFor={`start-${window.key}`}>From</Label>
                <Input
                  id={`start-${window.key}`}
                  type="time"
                  value={window.start}
                  onChange={(event) =>
                    updateWindow(window.key, { start: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`end-${window.key}`}>Until</Label>
                <Input
                  id={`end-${window.key}`}
                  type="time"
                  value={window.end}
                  onChange={(event) =>
                    updateWindow(window.key, { end: event.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setWindows((current) =>
                    current.filter((w) => w.key !== window.key),
                  )
                }
              >
                <Trash2 aria-hidden />
                Remove
              </Button>
            </div>
            <FieldError
              message={
                errors[`timeWindows.${index}.end`] ??
                errors[`timeWindows.${index}.start`]
              }
            />
          </fieldset>
        ))}

        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={addWindow}
        >
          <Plus aria-hidden />
          Add window
        </Button>
      </section>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save limits"}
        </Button>
        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={cn(
              "text-sm",
              state.status === "error"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
