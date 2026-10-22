import type { SpendingConstraints, Weekday } from "@finpal/contracts";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import {
  Button,
  ChipRow,
  Notice,
  SelectField,
  TextField,
  Toggle,
} from "@/components/form";
import { useToast } from "@/components/toast";
import {
  Card,
  ErrorNotice,
  Eyebrow,
  Loading,
  Screen,
  Text,
  Title,
} from "@/components/ui";
import { ApiRequestError, apiRequest, errorMessage } from "@/lib/api";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { useApi } from "@/lib/use-api";

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

// Used when the phone's JavaScript engine cannot list every IANA zone.
const COMMON_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function timeZones() {
  try {
    const list = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    return list?.length ? list : COMMON_ZONES;
  } catch {
    return COMMON_ZONES;
  }
}

const amount = (value: number | undefined) =>
  value === undefined ? "" : value.toFixed(2);
const optional = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

type Loaded = { constraints: SpendingConstraints | null; canClear: boolean };

export default function Constraints() {
  const { data, error, loading, refreshing, refresh } = useApi<Loaded>(
    "/api/v1/constraints",
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {loading ? (
        <>
          <Title>Constraints</Title>
          <Loading />
        </>
      ) : error || !data ? (
        <>
          <Title>Constraints</Title>
          <ErrorNotice message={error ?? "No data."} onRetry={refresh} />
        </>
      ) : (
        <Form
          // Reset the form when the saved constraints change.
          key={JSON.stringify(data.constraints)}
          initial={data.constraints}
          canClear={data.canClear}
          onSaved={refresh}
        />
      )}
    </Screen>
  );
}

function Form({
  initial,
  canClear,
  onSaved,
}: {
  initial: SpendingConstraints | null;
  canClear: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { colors } = useTheme();
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const zones = useMemo(() => {
    const all = timeZones();
    return all.includes(timezone) ? all : [timezone, ...all];
  }, [timezone]);

  // Clear field errors as soon as the user edits.
  useEffect(
    () => setErrors({}),
    [timezone, days, start, end, perPurchase, daily, monthly, currency],
  );

  const crosses = end < start;
  const windowNote = crosses
    ? `Window crosses midnight: allowed from ${start} until ${end} the next day.`
    : `Allowed from ${start} up to, not including, ${end}.`;

  async function save() {
    setSaving(true);
    try {
      await apiRequest("/api/v1/constraints", {
        method: "PUT",
        body: {
          constraints: enabled
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
        },
      });
      toast(
        enabled
          ? "Constraints saved. They apply to new proposals."
          : "Constraints cleared. Every new proposal goes to manual review.",
      );
      onSaved();
    } catch (caught) {
      if (
        caught instanceof ApiRequestError &&
        caught.details &&
        typeof caught.details.fieldErrors === "object"
      ) {
        setErrors(caught.details.fieldErrors as Record<string, string>);
      }
      toast(errorMessage(caught), "bad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <View style={{ gap: s(8) }}>
        <Title>Constraints</Title>
        <Text
          style={{ color: colors.ink3, fontSize: ms(14), lineHeight: ms(21) }}
        >
          When and how much FinPal may spend. Applied to every new proposal.
        </Text>
      </View>

      <Toggle
        label={enabled ? "Enforced" : "Not configured"}
        value={enabled}
        onChange={setEnabled}
        disabled={!canClear && initial !== null && enabled}
      />
      {!canClear && initial !== null && enabled ? (
        <Text style={{ color: colors.ink4, fontSize: ms(12.5) }}>
          Clearing constraints is not supported by the backend yet.
        </Text>
      ) : null}

      {!enabled ? (
        <Notice tone="warn">
          No constraints configured. This is not unrestricted permission: every
          proposal goes to manual review.
        </Notice>
      ) : null}

      <View
        style={{ opacity: enabled ? 1 : 0.45 }}
        pointerEvents={enabled ? "auto" : "none"}
      >
        <Card style={{ gap: s(14) }}>
          <Eyebrow>Allowed time window</Eyebrow>
          <SelectField
            label="Timezone"
            value={timezone}
            options={zones}
            onChange={setTimezone}
            searchable
            error={errors.timezone}
          />
          <View style={{ flexDirection: "row", gap: s(12) }}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Start (inclusive)"
                value={start}
                onChangeText={setStart}
                monospace
                keyboardType="numbers-and-punctuation"
                placeholder="08:00"
                error={errors["timeWindows.0.start"]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label="End (exclusive)"
                value={end}
                onChangeText={setEnd}
                monospace
                keyboardType="numbers-and-punctuation"
                placeholder="22:00"
                error={errors["timeWindows.0.end"]}
              />
            </View>
          </View>
          <ChipRow
            label="Days"
            options={WEEKDAYS}
            values={days}
            onChange={(day) =>
              setDays((current) =>
                current.includes(day)
                  ? current.filter((d) => d !== day)
                  : [...current, day],
              )
            }
          />
          {errors["timeWindows.0.days"] ? (
            <Text style={{ color: colors.tones.bad.color, fontSize: ms(12.5) }}>
              {errors["timeWindows.0.days"]}
            </Text>
          ) : null}
          <Text
            style={{
              color: colors.ink4,
              fontSize: ms(12.5),
              lineHeight: ms(18),
            }}
          >
            {windowNote}
            {extraWindows.length
              ? ` ${extraWindows.length} more window${extraWindows.length > 1 ? "s are" : " is"} kept unchanged.`
              : ""}
          </Text>

          <Eyebrow>Amount caps (inclusive)</Eyebrow>
          <TextField
            label="Per transaction"
            value={perPurchase}
            onChangeText={setPerPurchase}
            monospace
            keyboardType="decimal-pad"
            error={errors["amountCaps.perPurchase"]}
          />
          <TextField
            label="Daily"
            value={daily}
            onChangeText={setDaily}
            monospace
            keyboardType="decimal-pad"
            placeholder="No cap"
            error={errors["amountCaps.daily"]}
          />
          <TextField
            label="Monthly"
            value={monthly}
            onChangeText={setMonthly}
            monospace
            keyboardType="decimal-pad"
            placeholder="No cap"
            error={errors["amountCaps.monthly"]}
          />
          <SelectField
            label="Currency"
            value={currency}
            options={CURRENCIES}
            onChange={setCurrency}
            error={errors.currency}
          />
        </Card>
      </View>

      <Button
        label={enabled ? "Save constraints" : "Clear constraints"}
        variant="primary"
        busy={saving}
        onPress={save}
      />
    </>
  );
}
