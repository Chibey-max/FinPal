"use client";

import type { PaymentAttempt, PaymentStatus } from "@finpal/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/toast";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { apiRequest, errorMessage } from "@/lib/api-client";

export type DecisionActionState =
  | { kind: "pay" }
  | { kind: "payment"; paymentId: string; status: PaymentStatus }
  | { kind: "review" }
  | { kind: "blocked" }
  | { kind: "rejected" };

/** One key per decision: retries and double clicks reuse the same order. */
export const idempotencyKeyFor = (decisionId: string) => `idem_${decisionId}`;

export function DecisionActions({
  decisionId,
  state,
}: {
  decisionId: string;
  state: DecisionActionState;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const key = idempotencyKeyFor(decisionId);

  async function createOrder() {
    setPending(true);
    try {
      const payment = await apiRequest<PaymentAttempt>("/api/v1/payments", {
        body: { decisionId, idempotencyKey: key },
      });
      toast(
        `PayPal order ${payment.paypalOrderId} created. Next: approve in PayPal.`,
      );
      startTransition(() => {
        router.push(`/app/payments/${payment.id}`);
        router.refresh();
      });
    } catch (error) {
      setPending(false);
      toast(errorMessage(error), "bad");
    }
  }

  return (
    <div className="card action-bar">
      {state.kind === "pay" ? (
        <>
          <LiquidButton
            type="button"
            size="lg"
            className="rounded-full"
            onClick={createOrder}
            disabled={pending}
          >
            {pending ? <span className="spinner" aria-hidden /> : null}
            {pending ? "Creating order…" : "Create PayPal order"}
          </LiquidButton>
          <span className="endpoint">
            POST /api/v1/payments · idempotency {key.slice(0, 13)}…
          </span>
        </>
      ) : null}
      {state.kind === "payment" ? (
        <Link
          href={`/app/payments/${state.paymentId}`}
          className="btn btn-outline"
        >
          View payment · {state.status}
        </Link>
      ) : null}
      {state.kind === "review" ? (
        <>
          <span data-tone="warn">
            A person must approve or reject this proposal before any payment.
          </span>
          <Link
            href="/app/review"
            className="btn btn-outline btn-sm"
            data-hover-tone="warn"
          >
            Open review queue
          </Link>
        </>
      ) : null}
      {state.kind === "blocked" ? (
        <span data-tone="bad">
          Blocked. No payment attempt can be created for this decision.
        </span>
      ) : null}
      {state.kind === "rejected" ? (
        <span data-tone="bad">
          Rejected in review. No payment will be created.
        </span>
      ) : null}
    </div>
  );
}
