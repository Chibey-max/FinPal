"use client";

import type { PaymentAttempt } from "@finpal/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
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

type ConfirmKind = "finish" | "void" | "paypal";

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
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
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
      setConfirm(null);
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
      setConfirm(null);
    } catch (error) {
      toast(errorMessage(error), "bad");
    } finally {
      setRunning(null);
      refresh();
    }
  }

  function goToPaypal() {
    setConfirm(null);
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
          onClick={() => setConfirm("paypal")}
        >
          Approve in PayPal
        </LiquidButton>
      ) : null}
      {status === "APPROVED" || status === "AUTHORIZED" ? (
        <LiquidButton
          type="button"
          size="lg"
          className="rounded-full"
          onClick={() => setConfirm("finish")}
          disabled={running !== null}
        >
          Finish payment
        </LiquidButton>
      ) : null}
      {status === "AUTHORIZED" ? (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          data-hover-tone="warn"
          onClick={() => setConfirm("void")}
          disabled={running !== null}
        >
          Cancel and release the money
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

      <ConfirmDialog
        open={confirm === "paypal"}
        title="Open PayPal checkout?"
        description={
          <>
            You&apos;ll review <strong>{productName}</strong> ({amount}) in
            PayPal. Nothing is charged until you approve there.
          </>
        }
        confirmLabel="Continue to PayPal"
        tone="ok"
        onCancel={() => setConfirm(null)}
        onConfirm={goToPaypal}
      />
      <ConfirmDialog
        open={confirm === "finish"}
        title="Finish this payment?"
        description={
          <>
            FinPal will capture <strong>{amount}</strong> for {productName}.
          </>
        }
        confirmLabel="Finish payment"
        busyLabel="Finishing…"
        tone="ok"
        busy={running === "finish"}
        onCancel={() => {
          if (running === null) setConfirm(null);
        }}
        onConfirm={() => void finish()}
      />
      <ConfirmDialog
        open={confirm === "void"}
        title="Cancel and release the money?"
        description={
          <>
            The reserved <strong>{amount}</strong> for {productName} will be
            released. Nothing will be charged.
          </>
        }
        confirmLabel="Release the money"
        busyLabel="Cancelling…"
        tone="danger"
        busy={running === "void"}
        onCancel={() => {
          if (running === null) setConfirm(null);
        }}
        onConfirm={() => void cancel()}
      />

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
