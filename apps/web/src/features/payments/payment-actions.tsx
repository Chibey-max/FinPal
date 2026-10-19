"use client";

import type { PaymentAttempt, PaymentStatus } from "@finpal/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { useToast } from "@/components/toast";
import { formatMoney } from "@/features/app/present";
import { idempotencyKeyFor } from "@/features/decisions/decision-actions";
import { ApiRequestError, apiRequest, errorMessage } from "@/lib/api-client";

type ActionKey = "approve" | "authorize" | "capture" | "void" | "retry";

const ACTIONS: {
  key: ActionKey;
  label: string;
  endpoint: string;
  validFrom: PaymentStatus[];
  primary: boolean;
}[] = [
  {
    key: "approve",
    label: "Approve in PayPal",
    endpoint: "PayPal → GET /payments/return",
    validFrom: ["CREATED"],
    primary: true,
  },
  {
    key: "authorize",
    label: "Authorize",
    endpoint: "POST /payments/:id/authorize",
    validFrom: ["APPROVED"],
    primary: true,
  },
  {
    key: "capture",
    label: "Capture",
    endpoint: "POST /payments/:id/capture",
    validFrom: ["AUTHORIZED"],
    primary: true,
  },
  {
    key: "void",
    label: "Void",
    endpoint: "POST /payments/:id/void",
    validFrom: ["AUTHORIZED"],
    primary: false,
  },
  {
    key: "retry",
    label: "Retry create",
    endpoint: "POST /payments · same key",
    validFrom: ["CREATED", "APPROVED", "AUTHORIZED", "CAPTURED", "VOIDED"],
    primary: false,
  },
];

const GUARDED = new Set([
  "INVALID_TRANSITION",
  "ORDER_NOT_APPROVED",
  "CONCURRENT_MODIFICATION",
]);

export function PaymentActions({
  payment,
  productName,
  sandboxCheckout,
}: {
  payment: PaymentAttempt;
  productName: string;
  /** Mock mode: approve in a simulated Sandbox checkout instead of redirecting. */
  sandboxCheckout: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [running, setRunning] = useState<ActionKey | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [, startTransition] = useTransition();
  const status = payment.status;
  const amount = formatMoney(payment.amount, payment.currency);
  const refresh = () => startTransition(() => router.refresh());

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
      if (sandboxCheckout) setCheckoutOpen(true);
      else if (payment.approveUrl) window.location.assign(payment.approveUrl);
      else
        toast("PayPal did not return a checkout link for this order.", "bad");
      return;
    }
    setRunning(key);
    try {
      if (key === "authorize")
        await transition(
          "authorize",
          `Authorized ${amount}. The money is reserved, not taken.`,
        );
      if (key === "capture") await transition("capture", `Captured ${amount}.`);
      if (key === "void")
        await transition(
          "void",
          "Authorization voided before capture. Nothing was charged.",
        );
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
      refresh();
    } catch (error) {
      report(error);
      refresh();
    } finally {
      setRunning(null);
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
      refresh();
    } catch (error) {
      setCheckoutOpen(false);
      report(error);
      refresh();
    } finally {
      setRunning(null);
    }
  }

  return (
    <>
      <div className="action-tiles">
        {ACTIONS.map((action) => {
          const valid = action.validFrom.includes(status);
          return (
            <button
              key={action.key}
              type="button"
              className="action-tile-btn"
              data-primary={(valid && action.primary) || undefined}
              data-invalid={!valid || undefined}
              aria-describedby={!valid ? "invalid-hint" : undefined}
              onClick={() => run(action.key)}
              disabled={running !== null}
            >
              <span className="action-tile-btn__label">
                {running === action.key ? (
                  <span className="spinner" aria-hidden />
                ) : null}
                {action.label}
              </span>
              <span className="action-tile-btn__endpoint">
                {action.endpoint}
              </span>
            </button>
          );
        })}
      </div>
      <span id="invalid-hint" className="small ink4">
        Dimmed actions are invalid from the current state. Trying one shows the
        guarded transition rejecting it.
      </span>
      {checkoutOpen ? (
        <SandboxCheckout
          amount={amount}
          productName={productName}
          orderId={payment.paypalOrderId}
          busy={running === "approve"}
          onCancel={() => {
            setCheckoutOpen(false);
            toast("PayPal checkout was cancelled. Nothing was charged.", "bad");
          }}
          onApprove={approveInSandbox}
        />
      ) : null}
    </>
  );
}

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
  const ref = useRef<HTMLDialogElement>(null);

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
            {productName} · order {orderId}
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
          <button type="button" onClick={onApprove} disabled={busy} autoFocus>
            {busy ? "Approving…" : "Approve payment"}
          </button>
        </div>
        <span className="sandbox-card__note">
          Approval reserves nothing yet. FinPal authorizes after you return.
        </span>
      </div>
    </dialog>
  );
}
