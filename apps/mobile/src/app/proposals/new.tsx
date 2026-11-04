import type {
  CalendarEventsPage,
  DraftProposalResult,
  Proposal,
  ProposalEvaluation,
  SpendingConstraints,
  TrustSignal,
} from "@finpal/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import {
  Button,
  ChipRow,
  Notice,
  SelectField,
  TextField,
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
import { apiRequest, errorMessage } from "@/lib/api";
import { PRESETS, type PresetKey, type ProposalDraft } from "@/lib/presets";
import { formatMoney } from "@/lib/present";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { useApi } from "@/lib/use-api";
import { localDate, localTimeOfDay, zonedToDate } from "@/lib/zoned";
import { mono } from "@/theme";

type Summary = {
  mock: boolean;
  currency: string;
  timezone: string;
  spentToday: number;
  spentThisMonth: number;
  constraints: SpendingConstraints | null;
};

type EventContext = {
  id: string;
  title: string;
  /** "YYYY-MM-DD" in the constraints timezone. */
  date: string;
  time: string;
};

const BASE_CURRENCIES = ["USD", "EUR", "GBP"];
const PRICE = /^\d{1,7}(\.\d{1,2})?$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TRUST: { value: TrustSignal; label: string }[] = [
  { value: "NOT_CHECKED", label: "Not checked" },
  { value: "PASS", label: "Pass" },
  { value: "FAIL", label: "Fail" },
  { value: "UNAVAILABLE", label: "Unavailable" },
];

function validate(draft: ProposalDraft) {
  if (!draft.name.trim()) return "Product name is required.";
  if (!PRICE.test(draft.price.trim()) || Number(draft.price) <= 0) {
    return "Enter a price like 329.00.";
  }
  if (Number(draft.price) > 1_000_000) return "Prices are capped at 1,000,000.";
  if (!TIME.test(draft.time)) return "Enter the time as 24-hour HH:MM.";
  return null;
}

export default function NewProposal() {
  const params = useLocalSearchParams<{ preset?: string; event?: string }>();
  const summary = useApi<Summary>("/api/v1/summary");
  const events = useApi<CalendarEventsPage>(
    params.event ? "/api/v1/calendar/events?limit=50" : "/api/v1/summary",
  );

  const loading = summary.loading || (params.event ? events.loading : false);
  const error = summary.error ?? (params.event ? events.error : null);

  return (
    <Screen
      refreshing={summary.refreshing}
      onRefresh={() => {
        summary.refresh();
        if (params.event) events.refresh();
      }}
    >
      {loading && !error ? (
        <>
          <Title>New proposal</Title>
          <Loading />
        </>
      ) : error || !summary.data ? (
        <>
          <Title>New proposal</Title>
          <ErrorNotice
            message={error ?? "No data."}
            onRetry={summary.refresh}
          />
        </>
      ) : (
        <Form
          key={params.event ?? params.preset ?? "blank"}
          summary={summary.data}
          presetKey={
            params.preset && Object.hasOwn(PRESETS, params.preset)
              ? (params.preset as PresetKey)
              : null
          }
          eventId={params.event ?? null}
          calendar={
            params.event ? (events.data as CalendarEventsPage | null) : null
          }
        />
      )}
    </Screen>
  );
}

function Form({
  summary,
  presetKey,
  eventId,
  calendar,
}: {
  summary: Summary;
  presetKey: PresetKey | null;
  eventId: string | null;
  calendar: CalendarEventsPage | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { mock, timezone, constraints } = summary;
  const currency = constraints?.currency ?? summary.currency;

  const found = eventId
    ? calendar?.events.find((event) => event.id === eventId)
    : undefined;
  const [eventContext, setEventContext] = useState<EventContext | null>(
    found
      ? {
          id: found.id,
          title: found.title,
          date: localDate(new Date(found.startsAt), timezone),
          time: localTimeOfDay(new Date(found.startsAt), timezone),
        }
      : null,
  );

  const [draft, setDraft] = useState<ProposalDraft>(
    eventContext
      ? {
          name: "",
          price: "",
          currency,
          source: "CALENDAR",
          time: eventContext.time,
          trust: "NOT_CHECKED",
        }
      : {
          ...PRESETS[presetKey ?? "auto"].draft,
          source: "MANUAL",
        },
  );
  const [options, setOptions] = useState([
    ...new Set([currency, ...BASE_CURRENCIES]),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [request, setRequest] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState<DraftProposalResult | null>(null);

  function update<K extends keyof ProposalDraft>(
    key: K,
    value: ProposalDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function fillFromText() {
    const text = request.trim();
    if (text.length < 3 || drafting) return;
    setDrafting(true);
    try {
      const result = await apiRequest<DraftProposalResult>(
        "/api/v1/proposals/draft",
        { body: { text, currency } },
      );
      const { productName, proposedPrice, currency: c, time } = result.draft;
      if (c && !options.includes(c)) setOptions((list) => [...list, c]);
      setDraft((current) => ({
        ...current,
        name: productName ?? current.name,
        price:
          proposedPrice !== null ? proposedPrice.toFixed(2) : current.price,
        currency: c ?? current.currency,
        time: time ?? current.time,
      }));
      setDrafted(result);
      setError(null);
    } catch (caught) {
      toast(errorMessage(caught), "bad");
    } finally {
      setDrafting(false);
    }
  }

  function applyPreset(key: PresetKey) {
    setDraft({ ...PRESETS[key].draft, source: "MANUAL" });
    setEventContext(null);
    setDrafted(null);
    setError(null);
  }

  async function submit() {
    const problem = validate(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const date = eventContext?.date ?? localDate(new Date(), timezone);
      const proposal = await apiRequest<Proposal>("/api/v1/proposals", {
        body: {
          productName: draft.name.trim(),
          proposedPrice: Number(draft.price),
          currency: draft.currency,
          source: draft.source,
          sourceEventId: eventContext?.id,
          proposedFor: zonedToDate(date, draft.time, timezone).toISOString(),
          ...(mock ? { simulation: { trust: draft.trust } } : {}),
        },
      });
      const result = await apiRequest<ProposalEvaluation>(
        "/api/v1/evaluations",
        {
          body: { proposalId: proposal.id },
        },
      );
      router.replace(`/decisions/${result.decision.id}`);
    } catch (caught) {
      setPending(false);
      setError(errorMessage(caught));
      toast(errorMessage(caught), "bad");
    }
  }

  const caps = constraints?.amountCaps;
  const windows = constraints?.timeWindows ?? [];
  const rules = constraints
    ? [
        {
          k: "Window",
          v: windows.length
            ? `${windows[0]!.start}–${windows[0]!.end}${windows.length > 1 ? ` +${windows.length - 1}` : ""}`
            : "Any time",
        },
        { k: "Timezone", v: constraints.timezone },
        { k: "Per transaction", v: formatMoney(caps!.perPurchase, currency) },
        {
          k: "Daily left",
          v: caps?.daily
            ? formatMoney(
                Math.max(0, caps.daily - summary.spentToday),
                currency,
              )
            : "No cap",
        },
        {
          k: "Monthly left",
          v: caps?.monthly
            ? formatMoney(
                Math.max(0, caps.monthly - summary.spentThisMonth),
                currency,
              )
            : "No cap",
        },
        { k: "Currency", v: currency },
      ]
    : [{ k: "Constraints", v: "None · review only" }];

  return (
    <>
      <View style={{ gap: s(8) }}>
        <Title>New proposal</Title>
        <Text style={{ color: colors.ink3, fontSize: ms(14) }}>
          Creating a proposal does not create a payment.
        </Text>
      </View>

      {eventContext ? (
        <Notice tone="info">
          From event: {eventContext.title}. Product name and price are still
          required.
        </Notice>
      ) : null}

      {mock ? (
        <ChipRow
          label="Demo paths"
          options={(Object.keys(PRESETS) as PresetKey[]).map((key) => ({
            value: key,
            label: PRESETS[key].label,
          }))}
          onChange={applyPreset}
        />
      ) : null}

      <Card style={{ gap: s(12) }}>
        <Eyebrow>Describe it</Eyebrow>
        <TextField
          value={request}
          onChangeText={setRequest}
          placeholder="e.g. Sony WH-1000XM5 for $329 at 2:30pm"
          onSubmitEditing={fillFromText}
        />
        <Button
          label="Fill the form"
          onPress={fillFromText}
          busy={drafting}
          disabled={request.trim().length < 3}
        />
        {drafted ? (
          <Text
            style={{
              color: colors.ink3,
              fontSize: ms(12.5),
              lineHeight: ms(18),
            }}
          >
            Filled by{" "}
            {drafted.source === "llm"
              ? (drafted.model ?? "the assistant")
              : "the built-in rules"}
            .
            {drafted.missing.length
              ? ` Still needed: ${drafted.missing.map((f) => (f === "productName" ? "product name" : "price")).join(", ")}.`
              : " Check it, then evaluate."}
          </Text>
        ) : null}
      </Card>

      <Card style={{ gap: s(14) }}>
        <TextField
          label="Product"
          value={draft.name}
          onChangeText={(text) => update("name", text)}
          placeholder="What is it?"
        />
        <View style={{ flexDirection: "row", gap: s(12) }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Price"
              value={draft.price}
              onChangeText={(text) => update("price", text)}
              monospace
              keyboardType="decimal-pad"
              placeholder="329.00"
            />
          </View>
          <View style={{ flex: 1 }}>
            <SelectField
              label="Currency"
              value={draft.currency}
              options={options}
              onChange={(value) => update("currency", value)}
            />
          </View>
        </View>
        <TextField
          label={`Purchase time (${timezone})`}
          value={draft.time}
          onChangeText={(text) => update("time", text)}
          monospace
          keyboardType="numbers-and-punctuation"
          placeholder="14:30"
          hint="Spending windows are checked at this time."
        />
        {mock ? (
          <ChipRow
            label="Merchant trust (simulated KERNEL)"
            options={TRUST}
            value={draft.trust}
            onChange={(value) => update("trust", value)}
          />
        ) : null}
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <Button
          label={pending ? "Evaluating…" : "Evaluate proposal"}
          variant="primary"
          busy={pending}
          onPress={submit}
        />
      </Card>

      <Card style={{ gap: s(10) }}>
        <Eyebrow>Rules in force</Eyebrow>
        {rules.map((rule) => (
          <View
            key={rule.k}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: s(12),
            }}
          >
            <Text style={{ color: colors.ink3, fontSize: ms(13.5) }}>
              {rule.k}
            </Text>
            <Text
              style={{
                fontFamily: mono,
                fontSize: ms(12.5),
                flexShrink: 1,
                textAlign: "right",
              }}
            >
              {rule.v}
            </Text>
          </View>
        ))}
        <Text
          onPress={() => router.navigate("/constraints")}
          style={{ color: colors.brand, fontSize: ms(13.5) }}
        >
          Edit constraints →
        </Text>
      </Card>
    </>
  );
}
