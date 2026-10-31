"use client";

import type { ReviewStatus } from "@finpal/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/toast";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { apiRequest, errorMessage } from "@/lib/api-client";

/** Approve or reject an item the rules sent to a person. */
export function ReviewActions({
  decisionId,
  onDone,
}: {
  decisionId: string;
  /** Called instead of refreshing the page, e.g. on the Agent screen. */
  onDone?: (action: ReviewStatus) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<ReviewStatus | null>(null);
  const [, startTransition] = useTransition();

  async function review(action: ReviewStatus) {
    setPending(action);
    try {
      await apiRequest(`/api/v1/decisions/${decisionId}/review`, {
        body: { action },
      });
      toast(
        action === "APPROVED"
          ? "Approved. It can be paid now."
          : "Rejected. It won't be bought.",
        action === "APPROVED" ? "ok" : "bad",
      );
      if (onDone) onDone(action);
      else startTransition(() => router.refresh());
    } catch (error) {
      setPending(null);
      toast(errorMessage(error), "bad");
    }
  }

  return (
    <div className="review-actions">
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => review("REJECTED")}
        disabled={pending !== null}
      >
        {pending === "REJECTED" ? "Rejecting…" : "Reject"}
      </button>
      <LiquidButton
        type="button"
        size="lg"
        className="rounded-full"
        onClick={() => review("APPROVED")}
        disabled={pending !== null}
      >
        {pending === "APPROVED" ? "Approving…" : "Approve"}
      </LiquidButton>
    </div>
  );
}
