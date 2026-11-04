import type { DecisionOutcome, DecisionRow } from "@finpal/contracts";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import {
  Badge,
  Card,
  ErrorNotice,
  Loading,
  Screen,
  Text,
  Title,
} from "@/components/ui";
import { ms, s } from "@/lib/screen";
import { useApi, useTimezone } from "@/lib/use-api";
import {
  formatMoney,
  formatWhen,
  outcomeTone,
  scoreLabel,
  scoreTone,
  shortId,
} from "@/lib/present";
import { useTheme } from "@/lib/theme-context";
import { mono, radius } from "@/theme";

const FILTERS: { label: string; value: DecisionOutcome | null }[] = [
  { label: "All", value: null },
  { label: "Auto-approve", value: "AUTO_APPROVE" },
  { label: "Review", value: "MANUAL_REVIEW" },
  { label: "Blocked", value: "BLOCK" },
];

export default function Decisions() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data, error, loading, refreshing, refresh } = useApi<{
    rows: DecisionRow[];
  }>("/api/v1/decisions");
  const timezone = useTimezone();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DecisionOutcome | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (row) =>
        (filter === null || row.outcome === filter) &&
        (needle === "" ||
          row.productName.toLowerCase().includes(needle) ||
          shortId("dec", row.decisionId).includes(needle) ||
          row.outcome.toLowerCase().includes(needle)),
    );
  }, [data, query, filter]);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Title>Decisions</Title>
      <Text
        style={{ color: colors.ink2, fontSize: ms(14), lineHeight: ms(20) }}
      >
        Every evaluation, its evidence and the rule that decided it.
      </Text>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search product, outcome, ID…"
        placeholderTextColor={colors.ink4}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          color: colors.ink,
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.pill,
          paddingHorizontal: s(16),
          paddingVertical: s(11),
          fontSize: ms(15),
        }}
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}>
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Pressable
              key={f.label}
              onPress={() => setFilter(f.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: active ? colors.brand : colors.border,
                backgroundColor: active
                  ? colors.tones.info.fill
                  : "transparent",
                paddingHorizontal: s(13),
                paddingVertical: s(7),
              }}
            >
              <Text
                style={{
                  color: active ? colors.ink : colors.ink2,
                  fontSize: ms(13),
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={refresh} />
      ) : rows.length === 0 ? (
        <Card>
          <Text style={{ color: colors.ink2, fontSize: ms(14) }}>
            No decisions match.
          </Text>
        </Card>
      ) : (
        rows.map((row) => (
          <Card
            key={row.decisionId}
            onPress={() => router.push(`/decisions/${row.decisionId}`)}
            style={{ borderColor: colors.tones[outcomeTone[row.outcome]].line }}
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
                numberOfLines={2}
              >
                {row.productName}
              </Text>
              <Text style={{ color: colors.ink, fontSize: ms(16) }}>
                {formatMoney(row.amount, row.currency)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: s(6), flexWrap: "wrap" }}>
              <Badge label={row.outcome} tone={outcomeTone[row.outcome]} />
              <Badge
                label={scoreLabel(row.qualityScore)}
                tone={scoreTone[row.qualityScore]}
              />
            </View>
            <Text
              style={{ color: colors.ink3, fontFamily: mono, fontSize: ms(11) }}
            >
              {shortId("dec", row.decisionId)} ·{" "}
              {formatWhen(row.decidedAt, timezone)}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}
