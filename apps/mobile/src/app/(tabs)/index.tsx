import type { DecisionRow } from "@finpal/contracts";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import {
  Badge,
  Card,
  ErrorNotice,
  Eyebrow,
  Loading,
  Meter,
  Screen,
  Title,
} from "@/components/ui";
import { ms, s } from "@/lib/screen";
import { useApi } from "@/lib/use-api";
import {
  formatMoney,
  formatWhen,
  isOpenPayment,
  nextPaymentStep,
  outcomeTone,
  paymentTone,
  percentOf,
  shortId,
} from "@/lib/present";
import { colors, mono, type Tone } from "@/theme";

type Summary = {
  currency: string;
  timezone: string;
  spentToday: number;
  spentThisMonth: number;
  caps: { perPurchase: number; daily?: number; monthly?: number } | null;
};

export default function Overview() {
  const router = useRouter();
  const summary = useApi<Summary>("/api/v1/summary");
  const decisions = useApi<{ rows: DecisionRow[] }>("/api/v1/decisions");

  const refresh = () => {
    summary.refresh();
    decisions.refresh();
  };
  const refreshing = summary.refreshing || decisions.refreshing;
  const error = summary.error ?? decisions.error;

  if ((summary.loading || decisions.loading) && !error) {
    return (
      <Screen>
        <Title>Overview</Title>
        <Loading />
      </Screen>
    );
  }
  if (error || !summary.data || !decisions.data) {
    return (
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Title>Overview</Title>
        <ErrorNotice message={error ?? "No data."} onRetry={refresh} />
      </Screen>
    );
  }

  const { currency, timezone, spentToday, spentThisMonth, caps } = summary.data;
  const rows = decisions.data.rows;
  const count = (outcome: string) =>
    rows.filter((row) => row.outcome === outcome).length;
  const pending = rows.filter(
    (row) => row.outcome === "MANUAL_REVIEW" && row.reviewStatus === null,
  );
  const openPayments = rows.filter((row) => isOpenPayment(row.paymentStatus));

  const kpis: {
    label: string;
    value: string;
    sub: string;
    percent: number;
    tone: Tone;
  }[] = [
    {
      label: "Spent today",
      value: formatMoney(spentToday, currency),
      sub: caps?.daily
        ? `of ${formatMoney(caps.daily, currency)} daily cap`
        : "no daily cap set",
      percent: percentOf(spentToday, caps?.daily),
      tone: "ok",
    },
    {
      label: "This month",
      value: formatMoney(spentThisMonth, currency),
      sub: caps?.monthly
        ? `of ${formatMoney(caps.monthly, currency)} monthly cap`
        : "no monthly cap set",
      percent: percentOf(spentThisMonth, caps?.monthly),
      tone: "ok",
    },
    {
      label: "Decisions",
      value: String(rows.length),
      sub: `${count("AUTO_APPROVE")} auto · ${count("MANUAL_REVIEW")} review · ${count("BLOCK")} blocked`,
      percent: percentOf(count("AUTO_APPROVE"), rows.length),
      tone: "muted",
    },
    {
      label: "Open payments",
      value: String(openPayments.length),
      sub: openPayments.length ? "awaiting PayPal steps" : "all settled",
      percent: percentOf(
        openPayments.length,
        rows.filter((row) => row.paymentId).length,
      ),
      tone: "warn",
    },
  ];

  const attention = [
    ...pending.map((row) => ({
      key: `r-${row.decisionId}`,
      id: row.decisionId,
      title: row.productName,
      label: "MANUAL_REVIEW",
      tone: "warn" as Tone,
      sub: "awaiting a person",
    })),
    ...openPayments.map((row) => ({
      key: `p-${row.paymentId}`,
      id: row.decisionId,
      title: row.productName,
      label: row.paymentStatus!,
      tone: paymentTone[row.paymentStatus!],
      sub: `next: ${nextPaymentStep[row.paymentStatus!] ?? "check status"}`,
    })),
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Title>Overview</Title>

      {!caps ? (
        <Card style={{ borderColor: "rgba(242,200,121,0.35)" }}>
          <Badge label="NO CONSTRAINTS" tone="warn" />
          <Text
            style={{ color: colors.ink2, fontSize: ms(14), lineHeight: ms(20) }}
          >
            This is not unrestricted permission: every proposal goes to manual
            review.
          </Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(10) }}>
        {kpis.map((kpi) => (
          <Card key={kpi.label} style={{ flexBasis: "47%", flexGrow: 1 }}>
            <Eyebrow>{kpi.label}</Eyebrow>
            <Text
              style={{ color: colors.ink, fontSize: ms(26), fontWeight: "300" }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {kpi.value}
            </Text>
            <Meter percent={kpi.percent} tone={kpi.tone} />
            <Text style={{ color: colors.ink3, fontSize: ms(12) }}>
              {kpi.sub}
            </Text>
          </Card>
        ))}
      </View>

      <Eyebrow>Needs attention</Eyebrow>
      {attention.length === 0 ? (
        <Card>
          <Text style={{ color: colors.ink2, fontSize: ms(14) }}>
            Nothing is waiting on you.
          </Text>
        </Card>
      ) : (
        attention.map((item) => (
          <Card
            key={item.key}
            onPress={() => router.push(`/decisions/${item.id}`)}
          >
            <Badge label={item.label} tone={item.tone} />
            <Text style={{ color: colors.ink, fontSize: ms(16) }}>
              {item.title}
            </Text>
            <Text style={{ color: colors.ink3, fontSize: ms(13) }}>
              {item.sub}
            </Text>
          </Card>
        ))
      )}

      <Eyebrow>Recent decisions</Eyebrow>
      {rows.slice(0, 5).map((row) => (
        <Card
          key={row.decisionId}
          onPress={() => router.push(`/decisions/${row.decisionId}`)}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: s(12),
            }}
          >
            <Text
              style={{ color: colors.ink, fontSize: ms(16), flexShrink: 1 }}
              numberOfLines={1}
            >
              {row.productName}
            </Text>
            <Text style={{ color: colors.ink, fontSize: ms(16) }}>
              {formatMoney(row.amount, row.currency)}
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Badge label={row.outcome} tone={outcomeTone[row.outcome]} />
            <Text
              style={{ color: colors.ink3, fontFamily: mono, fontSize: ms(11) }}
            >
              {shortId("dec", row.decisionId)} ·{" "}
              {formatWhen(row.decidedAt, timezone)}
            </Text>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
