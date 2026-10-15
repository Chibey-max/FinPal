"use client";

import type {
  DecisionOutcome,
  DecisionReason,
  ProposalEvaluation,
} from "@finpal/contracts";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const outcomeStyles: Record<
  DecisionOutcome,
  { label: string; className: string }
> = {
  AUTO_APPROVE: {
    label: "Approved",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  },
  MANUAL_REVIEW: {
    label: "Needs review",
    className:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  },
  BLOCK: {
    label: "Blocked",
    className:
      "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
  },
};

const sourceLabels: Record<DecisionReason["source"], string> = {
  constraints: "Rules",
  amount: "Caps",
  quality: "Price",
  trust: "Merchant",
  decision: "Decision",
};

function money(amount: number | null, currency: string) {
  if (amount === null) return "–";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount,
  );
}

export function PayButton({ decisionId }: { decisionId: string }) {
  // One key per decision, so retries and double-clicks reuse the same order.
  const idempotencyKey = useRef(crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function pay() {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionId,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body?.error?.message ?? "Payment failed.");
      if (!body.approveUrl)
        throw new Error("PayPal did not return a checkout link.");
      window.location.assign(body.approveUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment failed.");
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button onClick={pay} disabled={pending} className="justify-self-start">
        {pending ? "Opening PayPal…" : "Continue to PayPal (Sandbox)"}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function DecisionCard({ result }: { result: ProposalEvaluation }) {
  const { proposal, evaluation, decision } = result;
  const { quality } = evaluation;
  const style = outcomeStyles[decision.outcome];

  return (
    <section className="grid gap-5" aria-live="polite">
      <div className={cn("rounded-md border px-4 py-3", style.className)}>
        <p className="text-xs font-medium tracking-wide uppercase">
          {decision.outcome}
        </p>
        <p className="text-lg font-semibold">
          {style.label}: {proposal.productName} for{" "}
          {money(proposal.proposedPrice, proposal.currency)}
        </p>
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">Why</h3>
        <ul className="grid gap-2">
          {decision.reasons.map((reason, index) => (
            <li key={index} className="flex gap-3 text-sm">
              <span className="bg-muted text-muted-foreground h-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium">
                {sourceLabels[reason.source]}
              </span>
              <span>{reason.message}</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["Quality", quality.score],
          ["Median", money(quality.medianPrice, quality.currency)],
          ["Lowest", money(quality.lowestPrice, quality.currency)],
          ["Offers", String(quality.offerCount)],
          ["Rules", evaluation.constraintCheck?.constraints ?? "Not set"],
          ["Caps", evaluation.constraintCheck?.amount ?? "Not set"],
          ["Merchant trust", evaluation.trustSignal],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border px-3 py-2">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {quality.references.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            Reference offers ({quality.references.length})
          </summary>
          <ul className="mt-2 grid gap-1">
            {quality.references.slice(0, 10).map((offer) => (
              <li
                key={`${offer.merchant}|${offer.productId}`}
                className="flex gap-3"
              >
                <span className="w-24 shrink-0 tabular-nums">
                  {money(offer.price, offer.currency)}
                </span>
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:underline"
                >
                  {offer.merchant} · {offer.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {decision.outcome === "AUTO_APPROVE" ? (
        <PayButton decisionId={decision.id} />
      ) : null}
      {decision.outcome === "MANUAL_REVIEW" ? (
        <p className="text-muted-foreground text-sm">
          This purchase is waiting for your review. Nothing has been charged.
        </p>
      ) : null}
      {decision.outcome === "BLOCK" ? (
        <p className="text-muted-foreground text-sm">
          FinPal will not pay for this. Nothing has been charged.
        </p>
      ) : null}
    </section>
  );
}
