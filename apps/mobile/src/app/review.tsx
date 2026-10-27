import type { DecisionRow, ReviewStatus } from "@finpal/contracts";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/form";
import { useToast } from "@/components/toast";
import {
  Card,
  ErrorNotice,
  Loading,
  Screen,
  Text,
  Title,
} from "@/components/ui";
import { apiRequest, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  formatMoney,
  formatWhen,
  scoreLabel,
  scoreTone,
  shortId,
} from "@/lib/present";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { useApi, useTimezone } from "@/lib/use-api";
import { mono } from "@/theme";

/** Manual-review decisions waiting for a person: approve or reject. */
export default function ReviewQueue() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { mock } = useAuth();
  const timezone = useTimezone();
  const { data, error, loading, refreshing, refresh } = useApi<{
    rows: DecisionRow[];
  }>("/api/v1/decisions");
  // One decision at a time: which one, and which action.
  const [pending, setPending] = useState<{
    id: string;
    action: ReviewStatus;
  } | null>(null);

  const queue = (data?.rows ?? []).filter(
    (row) => row.outcome === "MANUAL_REVIEW" && row.reviewStatus === null,
  );

  async function review(row: DecisionRow, action: ReviewStatus) {
    setPending({ id: row.decisionId, action });
    try {
      await apiRequest(`/api/v1/decisions/${row.decisionId}/review`, {
        body: { action },
      });
      if (action === "APPROVED") {
        toast("Approved. The decision is now payable.");
        router.push(`/decisions/${row.decisionId}`);
      } else {
        toast("Rejected. No payment will be created.", "bad");
      }
      refresh();
    } catch (caught) {
      toast(errorMessage(caught), "bad");
    } finally {
      setPending(null);
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: s(8) }}>
        <Title>Review queue</Title>
        <Text
          style={{ color: colors.ink3, fontSize: ms(14), lineHeight: ms(21) }}
        >
          Fair prices, missing evidence, or unavailable trust data land here.
          Approving makes the decision payable; rejecting closes it for good.
        </Text>
      </View>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={refresh} />
      ) : queue.length === 0 ? (
        <Card style={{ gap: s(12), alignItems: "flex-start" }}>
          <Text style={{ color: colors.ink2, fontSize: ms(14) }}>
            The queue is empty.
            {mock ? " Try the Manual review demo path." : ""}
          </Text>
          {mock ? (
            <Button
              label="Run Manual review"
              onPress={() => router.navigate("/proposals/new?preset=review")}
            />
          ) : null}
        </Card>
      ) : (
        queue.map((row) => {
          const mine = pending?.id === row.decisionId;
          return (
            <Card key={row.decisionId} style={{ gap: s(12) }}>
              <Text
                style={{
                  fontFamily: mono,
                  fontSize: ms(11),
                  color: colors.ink4,
                }}
              >
                {shortId("dec", row.decisionId)} ·{" "}
                {formatWhen(row.decidedAt, timezone)}
              </Text>
              <Text style={{ fontSize: ms(18) }}>{row.productName}</Text>
              <Text
                style={{
                  fontFamily: mono,
                  fontSize: ms(12.5),
                  color: colors.ink2,
                }}
              >
                {formatMoney(row.amount, row.currency)} ·{" "}
                <Text
                  style={{
                    fontFamily: mono,
                    fontSize: ms(12.5),
                    color: colors.tones[scoreTone[row.qualityScore]].color,
                  }}
                >
                  {scoreLabel(row.qualityScore)}
                </Text>{" "}
                · median {formatMoney(row.medianPrice, row.currency)}
              </Text>
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", gap: s(6) }}
              >
                {row.reasonCodes.map((code) => (
                  <View
                    key={code}
                    style={{
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingHorizontal: s(8),
                      paddingVertical: s(3),
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: mono,
                        fontSize: ms(10.5),
                        color: colors.ink3,
                      }}
                    >
                      {code}
                    </Text>
                  </View>
                ))}
              </View>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: s(8),
                }}
              >
                <Button
                  label="Evidence"
                  variant="text"
                  onPress={() => router.push(`/decisions/${row.decisionId}`)}
                />
                <View style={{ flex: 1 }} />
                <Button
                  label="Reject"
                  variant="danger"
                  busy={mine && pending?.action === "REJECTED"}
                  disabled={pending !== null}
                  onPress={() => review(row, "REJECTED")}
                />
                <Button
                  label="Approve"
                  variant="primary"
                  busy={mine && pending?.action === "APPROVED"}
                  disabled={pending !== null}
                  onPress={() => review(row, "APPROVED")}
                />
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
