import type {
  DecisionDetail,
  DecisionExplanation,
  PaymentAttempt,
  ReviewStatus,
} from "@finpal/contracts";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { Button } from "@/components/form";
import { useToast } from "@/components/toast";
import { Card, Eyebrow, Text } from "@/components/ui";
import { apiRequest, errorMessage } from "@/lib/api";
import { idempotencyKeyFor } from "@/lib/present";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { mono } from "@/theme";

type State =
  | { status: "loading" }
  | { status: "ready"; explanation: DecisionExplanation }
  | { status: "error"; message: string };

/**
 * Plain-language wording of a decision. Loaded per decision; the outcome
 * badge stays the source of truth.
 */
export function DecisionSummary({ decisionId }: { decisionId: string }) {
  const { colors } = useTheme();
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    apiRequest<DecisionExplanation>(`/api/v1/decisions/${decisionId}/explain`, {
      method: "POST",
      body: {},
    })
      .then((explanation) => {
        if (live) setState({ status: "ready", explanation });
      })
      .catch((error) => {
        if (live) setState({ status: "error", message: errorMessage(error) });
      });
    return () => {
      live = false;
    };
  }, [decisionId, attempt]);

  return (
    <Card style={{ gap: s(10) }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Eyebrow>In plain words</Eyebrow>
        {state.status === "ready" ? (
          <Text
            style={{ fontFamily: mono, fontSize: ms(10.5), color: colors.ink4 }}
          >
            {state.explanation.source === "llm"
              ? `Groq · ${state.explanation.model}`
              : "Rules"}
          </Text>
        ) : null}
      </View>
      {state.status === "loading" ? (
        <ActivityIndicator
          color={colors.ink3}
          style={{ alignSelf: "flex-start" }}
        />
      ) : state.status === "error" ? (
        <Text
          style={{ color: colors.ink3, fontSize: ms(14), lineHeight: ms(21) }}
        >
          {state.message}{" "}
          <Text
            onPress={() => {
              setState({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
            style={{ color: colors.brand, fontSize: ms(14) }}
          >
            Retry
          </Text>
        </Text>
      ) : (
        <Text style={{ fontSize: ms(15), lineHeight: ms(23) }}>
          {state.explanation.text}
        </Text>
      )}
      <Text
        style={{ color: colors.ink4, fontSize: ms(12), lineHeight: ms(17) }}
      >
        AI wording only. The outcome is set by FinPal’s rules and cannot be
        changed by the model.
      </Text>
    </Card>
  );
}

/**
 * What can be done with this decision: review it, start a PayPal order, or
 * open the payment. Blocked and rejected decisions can never be paid.
 */
export function DecisionActions({
  detail,
  onChanged,
}: {
  detail: DecisionDetail;
  onChanged: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { decision, payment } = detail;
  const [pending, setPending] = useState<ReviewStatus | "order" | null>(null);

  async function createOrder() {
    setPending("order");
    try {
      const created = await apiRequest<PaymentAttempt>("/api/v1/payments", {
        body: {
          decisionId: decision.id,
          idempotencyKey: idempotencyKeyFor(decision.id),
        },
      });
      toast(
        `PayPal order ${created.paypalOrderId} created. Next: approve in PayPal.`,
      );
      router.push(`/payments/${created.id}`);
      onChanged();
    } catch (error) {
      toast(errorMessage(error), "bad");
    } finally {
      setPending(null);
    }
  }

  async function review(action: ReviewStatus) {
    setPending(action);
    try {
      await apiRequest(`/api/v1/decisions/${decision.id}/review`, {
        body: { action },
      });
      toast(
        action === "APPROVED"
          ? "Approved. The decision is now payable."
          : "Rejected. No payment will be created.",
        action === "APPROVED" ? "ok" : "bad",
      );
      onChanged();
    } catch (error) {
      toast(errorMessage(error), "bad");
    } finally {
      setPending(null);
    }
  }

  const note = (text: string, tone: "warn" | "bad") => (
    <Text
      style={{
        color: colors.tones[tone].color,
        fontSize: ms(14),
        lineHeight: ms(21),
      }}
    >
      {text}
    </Text>
  );

  let body;
  if (decision.outcome === "BLOCK") {
    body = note(
      "Blocked. No payment attempt can be created for this decision.",
      "bad",
    );
  } else if (decision.reviewStatus === "REJECTED") {
    body = note("Rejected in review. No payment will be created.", "bad");
  } else if (
    decision.outcome === "MANUAL_REVIEW" &&
    decision.reviewStatus === null
  ) {
    body = (
      <>
        {note(
          "A person must approve or reject this proposal before any payment.",
          "warn",
        )}
        <View
          style={{
            flexDirection: "row",
            gap: s(10),
            justifyContent: "flex-end",
          }}
        >
          <Button
            label="Reject"
            variant="danger"
            busy={pending === "REJECTED"}
            disabled={pending !== null}
            onPress={() => review("REJECTED")}
          />
          <Button
            label="Approve"
            variant="primary"
            busy={pending === "APPROVED"}
            disabled={pending !== null}
            onPress={() => review("APPROVED")}
          />
        </View>
      </>
    );
  } else if (payment) {
    body = (
      <Button
        label={`View payment · ${payment.status}`}
        onPress={() => router.push(`/payments/${payment.id}`)}
      />
    );
  } else {
    body = (
      <Button
        label={pending === "order" ? "Creating order…" : "Create PayPal order"}
        variant="primary"
        busy={pending === "order"}
        onPress={createOrder}
      />
    );
  }

  return <Card style={{ gap: s(12) }}>{body}</Card>;
}
