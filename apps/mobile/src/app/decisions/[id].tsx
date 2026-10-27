import type { DecisionDetail } from "@finpal/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { DecisionActions, DecisionSummary } from "@/components/decision-parts";
import {
  Badge,
  Card,
  ErrorNotice,
  Eyebrow,
  Loading,
  Row,
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
  paymentTone,
  scoreLabel,
  scoreTone,
  shortId,
  trustTone,
} from "@/lib/present";
import { useTheme } from "@/lib/theme-context";
import { mono } from "@/theme";

export default function DecisionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { data, error, loading, refreshing, refresh } = useApi<DecisionDetail>(
    `/api/v1/decisions/${id}`,
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Pressable
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/overview")
        }
        accessibilityRole="button"
        hitSlop={12}
      >
        <Text style={{ color: colors.brand, fontSize: ms(15) }}>‹ Back</Text>
      </Pressable>

      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorNotice message={error ?? "No data."} onRetry={refresh} />
      ) : (
        <Detail detail={data} onChanged={refresh} />
      )}
    </Screen>
  );
}

function Detail({
  detail,
  onChanged,
}: {
  detail: DecisionDetail;
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const { proposal, evaluation, decision, payment, events } = detail;
  const { quality } = evaluation;
  const tz = useTimezone();
  // The "Why" card already says it when a reason carries the explanation.
  const explained = decision.reasons.some((reason) =>
    reason.message.includes(quality.explanation),
  );

  return (
    <>
      <View style={{ gap: s(6) }}>
        <Title>{proposal.productName}</Title>
        <Text style={{ color: colors.ink2, fontSize: ms(20) }}>
          {formatMoney(proposal.proposedPrice, proposal.currency)}
        </Text>
        <Text
          style={{ color: colors.ink3, fontFamily: mono, fontSize: ms(11) }}
        >
          {shortId("dec", decision.id)} · {formatWhen(decision.decidedAt, tz)}
        </Text>
      </View>

      <DecisionSummary decisionId={decision.id} />

      <Card>
        <Eyebrow>Decision</Eyebrow>
        <Badge label={decision.outcome} tone={outcomeTone[decision.outcome]} />
        <Text
          style={{ color: colors.ink, fontSize: ms(15), lineHeight: ms(21) }}
        >
          {decision.reason}
        </Text>
        {decision.reviewStatus ? (
          <Row label="Review" value={decision.reviewStatus} />
        ) : null}
      </Card>

      <DecisionActions detail={detail} onChanged={onChanged} />

      <Card>
        <Eyebrow>Why</Eyebrow>
        {decision.reasons.map((reason) => (
          <View key={`${reason.source}-${reason.code}`} style={{ gap: s(2) }}>
            <Text
              style={{ color: colors.ink3, fontFamily: mono, fontSize: ms(11) }}
            >
              {reason.source} · {reason.code}
            </Text>
            <Text
              style={{
                color: colors.ink2,
                fontSize: ms(14),
                lineHeight: ms(20),
              }}
            >
              {reason.message}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <Eyebrow>Price quality</Eyebrow>
        <Badge
          label={scoreLabel(quality.score)}
          tone={scoreTone[quality.score]}
        />
        {explained ? null : (
          <Text
            style={{ color: colors.ink2, fontSize: ms(14), lineHeight: ms(20) }}
          >
            {quality.explanation}
          </Text>
        )}
        <Row
          label="Median price"
          value={formatMoney(quality.medianPrice, quality.currency)}
        />
        <Row
          label="Lowest price"
          value={formatMoney(quality.lowestPrice, quality.currency)}
        />
        <Row label="Offers compared" value={String(quality.offerCount)} />
      </Card>

      <Card>
        <Eyebrow>Merchant trust</Eyebrow>
        <Badge
          label={evaluation.trustSignal}
          tone={trustTone[evaluation.trustSignal]}
        />
      </Card>

      <Card>
        <Eyebrow>Payment</Eyebrow>
        {payment ? (
          <>
            <Badge label={payment.status} tone={paymentTone[payment.status]} />
            <Row
              label="Amount"
              value={formatMoney(payment.amount, payment.currency)}
            />
            <Row label="Updated" value={formatWhen(payment.updatedAt, tz)} />
          </>
        ) : (
          <Text style={{ color: colors.ink2, fontSize: ms(14) }}>
            No payment started.
          </Text>
        )}
      </Card>

      <Card>
        <Eyebrow>Audit trail</Eyebrow>
        {events.length === 0 ? (
          <Text style={{ color: colors.ink2, fontSize: ms(14) }}>
            No events.
          </Text>
        ) : (
          events.map((event) => (
            <View key={event.id} style={{ gap: s(2), paddingVertical: s(4) }}>
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: mono,
                  fontSize: ms(12),
                }}
              >
                {event.type}
              </Text>
              <Text style={{ color: colors.ink3, fontSize: ms(12) }}>
                {formatWhen(event.createdAt, tz)}
              </Text>
            </View>
          ))
        )}
      </Card>
    </>
  );
}
