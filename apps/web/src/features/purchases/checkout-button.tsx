"use client";

import type { Basket } from "@finpal/contracts";
import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { formatMoney } from "@/features/app/present";
import { apiRequest, errorMessage } from "@/lib/api-client";

/**
 * The one approval: creates a single PayPal order for the items and sends the
 * buyer to approve it. FinPal finishes the payment when they come back. In
 * mock mode a simulated checkout stands in for PayPal.
 */
export function CheckoutButton({
  decisionIds,
  idempotencyKey,
  label,
  summary,
  sandbox,
  onPaid,
  disabled,
}: {
  decisionIds: string[];
  idempotencyKey: string;
  label: string;
  /** What's being paid for, shown in the simulated checkout. */
  summary: string;
  sandbox: boolean;
  onPaid: (basket: Basket) => void;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [basket, setBasket] = useState<Basket | null>(null);

  async function start() {
    setPending(true);
    try {
      const created = await apiRequest<Basket>("/api/v1/baskets", {
        body: { decisionIds, idempotencyKey },
      });
      if (sandbox) {
        setBasket(created);
        return;
      }
      if (!created.approveUrl) {
        toast("PayPal did not return a checkout link for this order.", "bad");
        setPending(false);
        return;
      }
      window.location.assign(created.approveUrl);
    } catch (error) {
      setPending(false);
      toast(errorMessage(error), "bad");
    }
  }

  async function approve() {
    if (!basket) return;
    try {
      await apiRequest(`/api/v1/baskets/${basket.id}/sandbox-approve`, {
        method: "POST",
        body: {},
      });
      const paid = await apiRequest<Basket>(
        `/api/v1/baskets/${basket.id}/settle`,
        { method: "POST", body: {} },
      );
      setBasket(null);
      setPending(false);
      onPaid(paid);
    } catch (error) {
      setBasket(null);
      setPending(false);
      toast(errorMessage(error), "bad");
    }
  }

  return (
    <>
      <LiquidButton
        type="button"
        size="xl"
        className="rounded-full text-[15px]"
        onClick={start}
        disabled={pending || disabled}
      >
        {pending ? <span className="spinner" aria-hidden /> : null}
        {pending ? "Opening PayPal…" : label}
      </LiquidButton>
      {basket ? (
        <SandboxCheckout
          amount={formatMoney(basket.total, basket.currency)}
          summary={summary}
          orderId={basket.paypalOrderId}
          onCancel={() => {
            setBasket(null);
            setPending(false);
            toast("PayPal checkout was cancelled. Nothing was charged.", "bad");
          }}
          onApprove={approve}
        />
      ) : null}
    </>
  );
}

export function SandboxCheckout({
  amount,
  summary,
  orderId,
  onCancel,
  onApprove,
}: {
  amount: string;
  summary: string;
  orderId: string;
  onCancel: () => void;
  onApprove: () => void | Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sandbox-dialog"
      aria-labelledby="sandbox-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="sandbox-card">
        <div className="sandbox-card__head">
          <span id="sandbox-title" className="sandbox-card__brand">
            PayPal
          </span>
          <span className="sandbox-card__tag">SANDBOX</span>
        </div>
        <div className="sandbox-card__amount">
          <span>Pay FinPal Sandbox Merchant</span>
          <strong>{amount}</strong>
          <span>
            {summary} · order {orderId}
          </span>
        </div>
        <div className="sandbox-card__account">
          <span>sb-buyer@personal.example.com</span>
          <span>Visa ••42</span>
        </div>
        <div className="sandbox-card__actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              void onApprove();
            }}
            disabled={busy}
            autoFocus
          >
            {busy ? "Approving…" : "Approve payment"}
          </button>
        </div>
        <span className="sandbox-card__note">
          Simulated checkout. FinPal finishes the payment once you approve.
        </span>
      </div>
    </dialog>
  );
}
