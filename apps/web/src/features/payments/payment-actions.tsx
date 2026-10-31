"use client";

import type { PaymentAttempt } from "@finpal/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/toast";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { formatMoney } from "@/features/app/present";
import { SandboxCheckout } from "@/features/purchases/checkout-button";
import { apiRequest, errorMessage } from "@/lib/api-client";

const NOTE: Record<PaymentAttempt["status"], string> = {
  CREATED: "Waiting for your approval in PayPal.",
  APPROVED: "You approved this in PayPal. FinPal still has to finish it.",
  AUTHORIZED: "The money is reserved. FinPal still has to take it.",
  CAPTURED: "Paid.",
  VOIDED: "Cancelled. Nothing was charged.",
  REFUNDED: "Refunded.",
};

/**
 * Normally the agent finishes a payment by itself right after PayPal approval.
 * These controls only appear when something stopped it, such as PayPal being
 * unavailable or the buyer leaving before approving.
 */
export function PaymentActions({
  payment,
  productName,
  sandboxCheckout,
}: {
  payment: PaymentAttempt;
  productName: string;
  /** Mock mode: approve in a simulated checkout instead of redirecting. */
  sandboxCheckout: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [running, setRunning] = useState<"finish" | "void" | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [, startTransition] = useTransition();
  const { status } = payment;
  const amount = formatMoney(payment.amount, payment.currency);
  const refresh = () => startTransition(() => router.refresh());

  async function post(path: string) {
    return apiRequest<PaymentAttempt>(
      `/api/v1/payments/${payment.id}/${path}`,
      { method: "POST", body: {} },
    );
  }

  // authorize and capture both skip what's already done, so this is a safe retry.
  async function finish() {
    setRunning("finish");
    try {
      await post("authorize");
      await post("capture");
      toast(`Paid ${amount}.`);
    } catch (error) {
      toast(errorMessage(error), "bad");
    } finally {
      setRunning(null);
      refresh();
    }
  }

  async function cancel() {
    setRunning("void");
    try {
      await post("void");
      toast("Cancelled. Nothing was charged.");
    } catch (error) {
      toast(errorMessage(error), "bad");
    } finally {
      setRunning(null);
      refresh();
    }
  }

  function approve() {
    if (sandboxCheckout) setCheckoutOpen(true);
    else if (payment.approveUrl) window.location.assign(payment.approveUrl);
    else toast("PayPal did not return a checkout link for this order.", "bad");
  }

  return (
    <div className="card action-bar">
      <span>{NOTE[status]}</span>
      {status === "CREATED" ? (
        <LiquidButton
          type="button"
          size="lg"
          className="rounded-full"
          onClick={approve}
        >
          Approve in PayPal
        </LiquidButton>
      ) : null}
      {status === "APPROVED" || status === "AUTHORIZED" ? (
        <LiquidButton
          type="button"
          size="lg"
          className="rounded-full"
          onClick={finish}
          disabled={running !== null}
        >
          {running === "finish" ? (
            <span className="spinner" aria-hidden />
          ) : null}
          {running === "finish" ? "Finishing…" : "Finish payment"}
        </LiquidButton>
      ) : null}
      {status === "AUTHORIZED" ? (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          data-hover-tone="warn"
          onClick={cancel}
          disabled={running !== null}
        >
          {running === "void" ? "Cancelling…" : "Cancel and release the money"}
        </button>
      ) : null}
      {payment.basketId &&
      (status === "CREATED" ||
        status === "APPROVED" ||
        status === "AUTHORIZED") ? (
        <span className="small ink4">
          Paid together with the rest of its basket, so this applies to every
          item in it.
        </span>
      ) : null}
      {checkoutOpen ? (
        <SandboxCheckout
          amount={amount}
          summary={productName}
          orderId={payment.paypalOrderId}
          onCancel={() => {
            setCheckoutOpen(false);
            toast("PayPal checkout was cancelled. Nothing was charged.", "bad");
          }}
          onApprove={async () => {
            await post("sandbox-approve").catch(() => undefined);
            setCheckoutOpen(false);
            await finish();
          }}
        />
      ) : null}
    </div>
  );
}
