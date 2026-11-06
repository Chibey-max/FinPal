"use client";

import { useState } from "react";

import type { DecisionDetail } from "@finpal/contracts";

import { formatMoney } from "@/features/app/present";

function evidenceText(detail: DecisionDetail) {
  const { proposal, evaluation, decision } = detail;
  const quality = evaluation.quality;
  const lines = [
    `FinPal decision ${decision.id}`,
    `Item: ${proposal.productName}`,
    `Price: ${formatMoney(proposal.proposedPrice, proposal.currency)}`,
    `Outcome: ${decision.outcome}`,
    `Reason: ${decision.reason}`,
    `Quality: ${quality.score} (median ${quality.medianPrice != null ? formatMoney(quality.medianPrice, quality.currency) : "n/a"}, ${quality.offerCount} offers)`,
    `Trust: ${evaluation.trustSignal} (pass / fail / not checked / unavailable — not a score)`,
    `The model may pick the offer. It cannot pick AUTO_APPROVE or BLOCK.`,
  ];
  if (decision.reasons?.length) {
    lines.push("Reasons:");
    for (const reason of decision.reasons) {
      lines.push(`- [${reason.source}] ${reason.code}: ${reason.message}`);
    }
  }
  return lines.join("\n");
}

export function CopyEvidenceButton({ detail }: { detail: DecisionDetail }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(evidenceText(detail));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : "Copy evidence"}
    </button>
  );
}
