"use client";

import type { ReviewStatus } from "@finpal/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/toast";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { apiRequest, errorMessage } from "@/lib/api-client";

/** Approve or reject a MANUAL_REVIEW decision (POST /decisions/:id/review). */
export function ReviewActions({ decisionId }: { decisionId: string }) {
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
      if (action === "APPROVED") {
        toast("Approved. The decision is now payable.");
        startTransition(() => {
          router.push(`/app/decisions/${decisionId}`);
          router.refresh();
        });
      } else {
        toast("Rejected. No payment will be created.", "bad");
        startTransition(() => router.refresh());
      }
    } catch (error) {
      setPending(null);
      toast(errorMessage(error), "bad");
    }
  }

  return (
    <div className="review-actions">
      <Link href={`/app/decisions/${decisionId}`} className="btn btn-text">
        Evidence
      </Link>
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
