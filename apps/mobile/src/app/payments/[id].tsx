import type {
  ActivityPage,
  AuditEvent,
  DecisionRow,
  PaymentAttempt,
  PaymentStatus,
} from "@finpal/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";

import { Button } from "@/components/form";
import { useToast } from "@/components/toast";
import {
  Badge,
  Card,
  ErrorNotice,
  Eyebrow,
  Loading,
  Screen,
  Text,
  Title,
} from "@/components/ui";
import { ApiRequestError, apiRequest, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  formatMoney,
  formatWhen,
  idempotencyKeyFor,
  paymentTone,
  shortId,
} from "@/lib/present";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { useApi, useTimezone } from "@/lib/use-api";
import { font, mono } from "@/theme";

type ActionKey = "approve" | "authorize" | "capture" | "void" | "retry";

const ACTIONS: {
  key: ActionKey;
  label: string;
  hint: string;
  validFrom: PaymentStatus[];
  primary: boolean;
}[] = [
  {
    key: "approve",
    label: "Approve in PayPal",
    hint: "The buyer approves the order",
    validFrom: ["CREATED"],
    primary: true,
  },
  {
    key: "authorize",
    label: "Authorize",
    hint: "Reserve the money",
    validFrom: ["APPROVED"],
    primary: true,
  },
  {
    key: "capture",
    label: "Capture",
    hint: "Take the reserved money",
    validFrom: ["AUTHORIZED"],
    primary: true,
  },
  {
    key: "void",
    label: "Void",
    hint: "Release the reservation",
    validFrom: ["AUTHORIZED"],
    primary: false,
  },
  {
    key: "retry",
    label: "Retry create",
    hint: "Same key: never a second order",
    validFrom: ["CREATED", "APPROVED", "AUTHORIZED", "CAPTURED", "VOIDED"],
    primary: false,
  },
];

// Errors that mean "that step is not allowed from here", shown as such.
const GUARDED = new Set([
  "INVALID_TRANSITION",
  "ORDER_NOT_APPROVED",
  "CONCURRENT_MODIFICATION",
]);

const stateEvents: Partial<Record<AuditEvent["type"], PaymentStatus>> = {
  PAYMENT_CREATED: "CREATED",
  PAYMENT_APPROVED: "APPROVED",
  PAYMENT_AUTHORIZED: "AUTHORIZED",
  PAYMENT_CAPTURED: "CAPTURED",
  PAYMENT_VOIDED: "VOIDED",
};

export default function PaymentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const payment = useApi<PaymentAttempt>(`/api/v1/payments/${id}`);
  const decisions = useApi<{ rows: DecisionRow[] }>("/api/v1/decisions");
  const history = useApi<ActivityPage>(
    `/api/v1/activity?entityId=${id}&limit=100`,
  );

  const refreshAll = () => {
    payment.refresh();
    decisions.refresh();
    history.refresh();
  };
  const refreshing =
    payment.refreshing || decisions.refreshing || history.refreshing;

  const productName =
    decisions.data?.rows.find((row) => row.paymentId === id)?.productName ??
    "Purchase";

  return (
    <Screen refreshing={refreshing} onRefresh={refreshAll}>
      <Pressable
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/payments")
        }
        accessibilityRole="button"
        hitSlop={12}
      >
        <Text style={{ color: colors.brand, fontSize: ms(15) }}>‹ Back</Text>
      </Pressable>

      {payment.loading ? (
        <Loading />
      ) : payment.error || !payment.data ? (
        <ErrorNotice
          message={payment.error ?? "No data."}
          onRetry={refreshAll}
        />
      ) : (
        <Detail
          payment={payment.data}
          productName={productName}
          events={history.data?.events ?? []}
          onChanged={refreshAll}
        />
      )}
    </Screen>
  );
}

function Detail({
  payment,
  productName,
  events,
  onChanged,
}: {
  payment: PaymentAttempt;
  productName: string;
  events: AuditEvent[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { mock } = useAuth();
  const timezone = useTimezone();
  const [running, setRunning] = useState<ActionKey | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const status = payment.status;
  const amount = formatMoney(payment.amount, payment.currency);

  // CREATED -> APPROVED -> AUTHORIZED -> CAPTURED (or VOIDED).
  const rail: PaymentStatus[] = [
    "CREATED",
    "APPROVED",
    "AUTHORIZED",
    status === "VOIDED" ? "VOIDED" : "CAPTURED",
  ];
  const railIndex = rail.indexOf(status);

  function report(error: unknown) {
    const guarded = error instanceof ApiRequestError && GUARDED.has(error.code);
    toast(
      `${guarded ? "Guarded transition rejected. " : ""}${errorMessage(error)}`,
      "bad",
    );
  }

  async function transition(
    path: "authorize" | "capture" | "void",
    done: string,
  ) {
    const updated = await apiRequest<PaymentAttempt>(
      `/api/v1/payments/${payment.id}/${path}`,
      { method: "POST", body: {} },
    );
    toast(
      updated.status === status
        ? `Already ${status}. The call is idempotent; nothing changed.`
        : done,
    );
  }

  async function run(key: ActionKey) {
    if (key === "approve") {
      if (status !== "CREATED") {
        toast(`Already approved in PayPal. This payment is ${status}.`, "bad");
        return;
      }
      if (mock) {
        setCheckoutOpen(true);
      } else if (payment.approveUrl) {
        // PayPal sends the buyer back to the server, which confirms and
        // authorizes; refresh when the browser closes to pick that up.
        await WebBrowser.openBrowserAsync(payment.approveUrl);
        onChanged();
      } else {
        toast("PayPal did not return a checkout link for this order.", "bad");
      }
      return;
    }
    setRunning(key);
    try {
      if (key === "authorize") {
        await transition(
          "authorize",
          `Authorized ${amount}. The money is reserved, not taken.`,
        );
      }
      if (key === "capture") await transition("capture", `Captured ${amount}.`);
      if (key === "void") {
        await transition(
          "void",
          "Authorization voided before capture. Nothing was charged.",
        );
      }
      if (key === "retry") {
        const replay = await apiRequest<PaymentAttempt>("/api/v1/payments", {
          body: {
            decisionId: payment.decisionId,
            idempotencyKey: idempotencyKeyFor(payment.decisionId),
          },
        });
        toast(
          replay.id === payment.id
            ? `Idempotent replay: returned existing order ${replay.paypalOrderId}. No new order created.`
            : `New order ${replay.paypalOrderId} created.`,
        );
      }
    } catch (error) {
      report(error);
    } finally {
      setRunning(null);
      onChanged();
    }
  }

  async function approveInSandbox() {
    setRunning("approve");
    try {
      await apiRequest(`/api/v1/payments/${payment.id}/sandbox-approve`, {
        method: "POST",
        body: {},
      });
      // What the PayPal return redirect does: confirm with PayPal, then authorize.
      await apiRequest(`/api/v1/payments/${payment.id}/authorize`, {
        method: "POST",
        body: {},
      });
      setCheckoutOpen(false);
      toast(
        `Buyer approved in PayPal. FinPal confirmed the order and authorized ${amount}.`,
      );
    } catch (error) {
      setCheckoutOpen(false);
      report(error);
    } finally {
      setRunning(null);
      onChanged();
    }
  }

  return (
    <>
      <Card style={{ gap: s(14) }}>
        <Text
          style={{ fontFamily: mono, fontSize: ms(11), color: colors.ink4 }}
        >
          {shortId("pay", payment.id)} · PayPal order {payment.paypalOrderId}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flexShrink: 1, gap: s(4) }}>
            <Title>{amount}</Title>
            <Text style={{ color: colors.ink3, fontSize: ms(14) }}>
              {productName} ·{" "}
              <Text
                onPress={() => router.push(`/decisions/${payment.decisionId}`)}
                style={{ color: colors.brand, fontSize: ms(14) }}
              >
                {shortId("dec", payment.decisionId)}
              </Text>
            </Text>
          </View>
          <Badge label={status} tone={paymentTone[status]} />
        </View>

        <View style={{ flexDirection: "row", gap: s(6) }}>
          {rail.map((state, index) => {
            const t = colors.tones[paymentTone[state]];
            const step =
              index < railIndex
                ? "done"
                : index === railIndex
                  ? "current"
                  : "todo";
            return (
              <View key={state} style={{ flex: 1, gap: s(6) }}>
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor:
                      step === "todo" ? colors.meterTrack : t.color,
                    opacity: step === "done" ? 0.55 : 1,
                  }}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: mono,
                    fontSize: ms(9.5),
                    color: step === "current" ? t.color : colors.ink4,
                  }}
                >
                  {state}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Card style={{ gap: s(10) }}>
        <Eyebrow>Next steps</Eyebrow>
        {ACTIONS.map((action) => {
          const valid = action.validFrom.includes(status);
          return (
            <View key={action.key} style={{ gap: s(2) }}>
              <Button
                label={action.label}
                variant={valid && action.primary ? "primary" : "outline"}
                busy={running === action.key}
                disabled={running !== null}
                style={{ opacity: valid ? 1 : 0.5 }}
                onPress={() => run(action.key)}
              />
              <Text
                style={{
                  color: colors.ink4,
                  fontSize: ms(12),
                  textAlign: "center",
                }}
              >
                {action.hint}
              </Text>
            </View>
          );
        })}
        <Text
          style={{ color: colors.ink4, fontSize: ms(12), lineHeight: ms(18) }}
        >
          Dimmed actions are invalid from the current state. Trying one shows
          the guarded transition rejecting it.
        </Text>
      </Card>

      <Card style={{ gap: s(10) }}>
        <Text style={{ fontFamily: font.medium, fontSize: ms(16) }}>
          State history
        </Text>
        {events.length === 0 ? (
          <Text style={{ color: colors.ink3, fontSize: ms(13) }}>
            No events yet.
          </Text>
        ) : (
          events
            .slice()
            .reverse()
            .map((event) => {
              const state = stateEvents[event.type];
              const issue =
                typeof event.payload.issue === "string"
                  ? ` · ${event.payload.issue}`
                  : "";
              return (
                <View
                  key={event.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: s(12),
                  }}
                >
                  <Text style={{ color: colors.ink4, fontSize: ms(12.5) }}>
                    {formatWhen(event.createdAt, timezone)}
                  </Text>
                  <Text
                    style={{
                      fontFamily: mono,
                      fontSize: ms(12),
                      flexShrink: 1,
                      textAlign: "right",
                      color:
                        colors.tones[state ? paymentTone[state] : "bad"].color,
                    }}
                  >
                    {state ?? `${event.type}${issue}`}
                  </Text>
                </View>
              );
            })
        )}
      </Card>

      <Modal
        visible={checkoutOpen}
        transparent
        animationType="fade"
        onRequestClose={() => running === null && setCheckoutOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: s(20),
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        >
          <SandboxCheckout
            amount={amount}
            productName={productName}
            orderId={payment.paypalOrderId}
            busy={running === "approve"}
            onCancel={() => {
              setCheckoutOpen(false);
              toast(
                "PayPal checkout was cancelled. Nothing was charged.",
                "bad",
              );
            }}
            onApprove={approveInSandbox}
          />
        </View>
      </Modal>
    </>
  );
}

/** Simulated PayPal Sandbox checkout, shown in mock mode only. */
function SandboxCheckout({
  amount,
  productName,
  orderId,
  busy,
  onCancel,
  onApprove,
}: {
  amount: string;
  productName: string;
  orderId: string;
  busy: boolean;
  onCancel: () => void;
  onApprove: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        gap: s(14),
        padding: s(20),
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.chromeLine,
        backgroundColor: colors.navSolid,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: font.bold, fontSize: ms(18) }}>PayPal</Text>
        <Text
          style={{ fontFamily: mono, fontSize: ms(10.5), color: colors.ink3 }}
        >
          SANDBOX
        </Text>
      </View>
      <View style={{ gap: s(4) }}>
        <Text style={{ color: colors.ink3, fontSize: ms(13) }}>
          Pay FinPal Sandbox Merchant
        </Text>
        <Text style={{ fontFamily: font.light, fontSize: ms(34) }}>
          {amount}
        </Text>
        <Text style={{ color: colors.ink3, fontSize: ms(12.5) }}>
          {productName} · order {orderId}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingVertical: s(10),
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.hairline,
        }}
      >
        <Text style={{ color: colors.ink2, fontSize: ms(13) }}>
          sb-buyer@personal.example.com
        </Text>
        <Text style={{ color: colors.ink2, fontSize: ms(13) }}>Visa ••42</Text>
      </View>
      <View
        style={{ flexDirection: "row", gap: s(10), justifyContent: "flex-end" }}
      >
        <Button label="Cancel" onPress={onCancel} disabled={busy} />
        <Button
          label={busy ? "Approving…" : "Approve payment"}
          variant="primary"
          onPress={onApprove}
          busy={busy}
        />
      </View>
      <Text style={{ color: colors.ink4, fontSize: ms(12) }}>
        Approval reserves nothing yet. FinPal authorizes after you return.
      </Text>
    </View>
  );
}
