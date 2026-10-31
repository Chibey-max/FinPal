"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useToast } from "@/components/toast";
import { formatMoney } from "@/features/app/present";
import { CheckoutButton } from "@/features/purchases/checkout-button";
import { ReviewActions } from "@/features/review/review-actions";

export type DecisionActionState =
  | { kind: "pay" }
  | { kind: "review" }
  | { kind: "blocked" }
  | { kind: "rejected" };

/** One key per decision: retries and double clicks reuse the same order. */
const keyFor = (decisionId: string) => `single_${decisionId}`;

export function DecisionActions({
  decisionId,
  state,
  productName,
  sandbox,
}: {
  decisionId: string;
  state: DecisionActionState;
  productName: string;
  sandbox: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  return (
    <div className="card action-bar">
      {state.kind === "pay" ? (
        <CheckoutButton
          decisionIds={[decisionId]}
          idempotencyKey={keyFor(decisionId)}
          label="Approve and pay with PayPal"
          summary={productName}
          sandbox={sandbox}
          onPaid={(basket) => {
            toast(`Paid ${formatMoney(basket.total, basket.currency)}.`);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
      {state.kind === "review" ? (
        <>
          <span data-tone="warn">
            FinPal&apos;s rules want a person to check this before any money
            moves.
          </span>
          <ReviewActions decisionId={decisionId} />
        </>
      ) : null}
      {state.kind === "blocked" ? (
        <span data-tone="bad">
          Blocked by your rules, so it can&apos;t be paid.
        </span>
      ) : null}
      {state.kind === "rejected" ? (
        <span data-tone="bad">
          You rejected this, so it won&apos;t be bought.
        </span>
      ) : null}
    </div>
  );
}
