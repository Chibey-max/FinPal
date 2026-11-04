import type { DecisionRow } from "@finpal/contracts";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { Button } from "@/components/form";
import {
  Badge,
  Card,
  ErrorNotice,
  Loading,
  Screen,
  Text,
  Title,
} from "@/components/ui";
import { formatMoney, paymentTone, shortId } from "@/lib/present";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { useApi } from "@/lib/use-api";
import { mono } from "@/theme";

/** Every PayPal payment attempt, most recently updated first. */
export default function Payments() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data, error, loading, refreshing, refresh } = useApi<{
    rows: DecisionRow[];
  }>("/api/v1/decisions");

  const payments = (data?.rows ?? [])
    .filter((row) => row.paymentId)
    .sort((a, b) =>
      (b.paymentUpdatedAt ?? "").localeCompare(a.paymentUpdatedAt ?? ""),
    );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Title>Payments</Title>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={refresh} />
      ) : payments.length === 0 ? (
        <Card style={{ gap: s(12), alignItems: "flex-start" }}>
          <Text
            style={{ color: colors.ink2, fontSize: ms(14), lineHeight: ms(21) }}
          >
            No payment attempts yet. Create a PayPal order from an approved
            decision.
          </Text>
          <Button
            label="View decisions"
            onPress={() => router.navigate("/decisions")}
          />
        </Card>
      ) : (
        payments.map((row) => (
          <Card
            key={row.paymentId}
            onPress={() => router.push(`/payments/${row.paymentId}`)}
            style={{ gap: s(8) }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: s(12),
              }}
            >
              <Text
                style={{ fontSize: ms(16), flexShrink: 1 }}
                numberOfLines={1}
              >
                {row.productName}
              </Text>
              <Text style={{ fontFamily: mono, fontSize: ms(14) }}>
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
              <Text
                style={{
                  fontFamily: mono,
                  fontSize: ms(11),
                  color: colors.ink4,
                }}
              >
                {shortId("pay", row.paymentId!)}
              </Text>
              <Badge
                label={row.paymentStatus!}
                tone={paymentTone[row.paymentStatus!]}
              />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
