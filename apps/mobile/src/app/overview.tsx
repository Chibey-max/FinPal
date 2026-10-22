import type { DecisionRow } from "@finpal/contracts";
import { useRouter, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { Button } from "@/components/form";
import {
  Badge,
  Card,
  CardHead,
  ErrorNotice,
  Eyebrow,
  Loading,
  Meter,
  Screen,
  Text,
  Title,
} from "@/components/ui";
import { ms, s } from "@/lib/screen";
import { useApi } from "@/lib/use-api";
import {
  formatMoney,
  isOpenPayment,
  nextPaymentStep,
  outcomeTone,
  paymentTone,
  percentOf,
  scoreLabel,
  scoreTone,
} from "@/lib/present";
import { useTheme } from "@/lib/theme-context";
import { font, mono, type Tone } from "@/theme";

type Summary = {
  currency: string;
  timezone: string;
  spentToday: number;
  spentThisMonth: number;
  caps: { perPurchase: number; daily?: number; monthly?: number } | null;
};

export default function Overview() {
  const router = useRouter();
  const { colors } = useTheme();
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

  const { currency, spentToday, spentThisMonth, caps } = summary.data;
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

  const actions = [
    ...pending.map((row) => ({
      key: `r-${row.decisionId}`,
      id: row.decisionId,
      title: row.productName,
      sub: "MANUAL_REVIEW · awaiting a person",
      tone: "warn" as Tone,
      href: "/review",
    })),
    ...openPayments.map((row) => ({
      key: `p-${row.paymentId}`,
      id: row.decisionId,
      title: row.productName,
      sub: `${row.paymentStatus} · next: ${nextPaymentStep[row.paymentStatus!] ?? "check status"}`,
      tone: paymentTone[row.paymentStatus!],
      href: `/payments/${row.paymentId}`,
    })),
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: s(12),
        }}
      >
        <Title>Overview</Title>
        <Button
          label="New proposal"
          variant="primary"
          onPress={() => router.navigate("/proposals/new")}
        />
      </View>

      {!caps ? (
        <Card style={{ borderColor: colors.tones.warn.line }}>
          <Badge label="NO CONSTRAINTS" tone="warn" />
          <Text
            style={{ color: colors.ink2, fontSize: ms(14), lineHeight: ms(21) }}
          >
            This is not unrestricted permission: every proposal goes to manual
            review.{" "}
            <Text
              onPress={() => router.navigate("/constraints")}
              style={{ color: colors.brand, fontSize: ms(14) }}
            >
              Set constraints →
            </Text>
          </Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(12) }}>
        {kpis.map((kpi) => (
          <Card key={kpi.label} style={{ flexBasis: "47%", flexGrow: 1 }}>
            <Eyebrow>{kpi.label}</Eyebrow>
            <Text
              style={{
                fontFamily: font.light,
                fontSize: ms(36),
                letterSpacing: -1.1,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {kpi.value}
            </Text>
            <Meter percent={kpi.percent} tone={kpi.tone} />
            <Text style={{ color: colors.ink3, fontSize: ms(13) }}>
              {kpi.sub}
            </Text>
          </Card>
        ))}
      </View>

      <Card style={{ padding: 0, gap: 0 }}>
        <View
          style={{
            padding: s(16),
            paddingHorizontal: s(18),
            borderBottomWidth: 1,
            borderBottomColor: colors.divider,
          }}
        >
          <CardHead
            title="Recent decisions"
            action="View all →"
            onAction={() => router.navigate("/decisions")}
          />
        </View>
        {rows.length === 0 ? (
          <Text
            style={{
              color: colors.ink3,
              fontSize: ms(14),
              padding: s(18),
            }}
          >
            No decisions yet. Evaluate a proposal to see the first one.
          </Text>
        ) : (
          rows.slice(0, 6).map((row, i) => (
            <Pressable
              key={row.decisionId}
              onPress={() => router.push(`/decisions/${row.decisionId}`)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: s(12),
                paddingVertical: s(13),
                paddingHorizontal: s(18),
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.hairline,
                backgroundColor: pressed ? colors.chrome : undefined,
              })}
            >
              <View style={{ flexShrink: 1, gap: s(4) }}>
                <Text style={{ fontSize: ms(14) }} numberOfLines={1}>
                  {row.productName}
                </Text>
                <Text
                  style={{
                    fontFamily: mono,
                    fontSize: ms(12),
                    color: colors.ink2,
                  }}
                >
                  {formatMoney(row.amount, row.currency)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: s(5) }}>
                <Badge
                  label={
                    row.reviewStatus
                      ? `REVIEW · ${row.reviewStatus}`
                      : row.outcome
                  }
                  tone={outcomeTone[row.outcome]}
                />
                <Text
                  style={{
                    fontFamily: mono,
                    fontSize: ms(11),
                    color: colors.tones[scoreTone[row.qualityScore]].color,
                  }}
                >
                  {scoreLabel(row.qualityScore)}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </Card>

      <Card style={{ gap: s(14), padding: s(20) }}>
        <Text style={{ fontFamily: font.medium, fontSize: ms(16) }}>
          Needs your action
        </Text>
        {actions.length ? (
          actions.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => router.push(action.href as Href)}
              style={({ pressed }) => ({
                gap: s(4),
                paddingVertical: s(12),
                paddingHorizontal: s(14),
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                backgroundColor: colors.inset,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}
            >
              <Text style={{ fontSize: ms(14) }}>{action.title}</Text>
              <Text
                style={{
                  fontFamily: mono,
                  fontSize: ms(11.5),
                  color: colors.tones[action.tone].color,
                }}
              >
                {action.sub}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={{ color: colors.ink3, fontSize: ms(14) }}>
            Nothing waiting. Payments and reviews are settled.
          </Text>
        )}
      </Card>
    </Screen>
  );
}
