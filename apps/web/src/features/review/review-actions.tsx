"use client";

import type { ReviewStatus } from "@finpal/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { apiRequest, errorMessage } from "@/lib/api-client";

/** Approve or reject an item the rules sent to a person. */
export function ReviewActions({
  decisionId,
  decisionIds,
  subject,
  onDone,
}: {
  decisionId: string;
  /** Extra units of the same line (quantity); reviewed with the first id. */
  decisionIds?: string[];
  /** Optional product name for the confirm copy. */
  subject?: string;
  /** Called instead of refreshing the page, e.g. on the Agent screen. */
  onDone?: (action: ReviewStatus) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState<ReviewStatus | null>(null);
  const [pending, setPending] = useState<ReviewStatus | null>(null);
  const [, startTransition] = useTransition();
  const ids = [...new Set([decisionId, ...(decisionIds ?? [])])];
  const count = ids.length;
  const name = subject?.trim();

  async function review(action: ReviewStatus) {
    setPending(action);
    try {
      for (const id of ids) {
        await apiRequest(`/api/v1/decisions/${id}/review`, {
          body: { action },
        });
      }
      toast(
        action === "APPROVED"
          ? count > 1
            ? `Approved ${count} units. They can be paid now.`
            : "Approved. It can be paid now."
          : count > 1
            ? `Rejected ${count} units. They won't be bought.`
            : "Rejected. It won't be bought.",
        action === "APPROVED" ? "ok" : "bad",
      );
      setConfirm(null);
      if (onDone) onDone(action);
      else startTransition(() => router.refresh());
    } catch (error) {
      setPending(null);
      toast(errorMessage(error), "bad");
    }
  }

  const approving = confirm === "APPROVED";
  const unitLabel =
    count > 1 ? `${count} units` : name ? name : "this purchase";

  return (
    <div className="review-actions">
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => setConfirm("REJECTED")}
        disabled={pending !== null}
      >
        Reject
      </button>
      <LiquidButton
        type="button"
        size="lg"
        className="rounded-full"
        onClick={() => setConfirm("APPROVED")}
        disabled={pending !== null}
      >
        Approve
      </LiquidButton>

      <ConfirmDialog
        open={confirm !== null}
        title={
          approving
            ? count > 1
              ? `Approve ${count} units?`
              : name
                ? `Approve ${name}?`
                : "Approve this purchase?"
            : count > 1
              ? `Reject ${count} units?`
              : name
                ? `Reject ${name}?`
                : "Reject this purchase?"
        }
        description={
          approving
            ? `${unitLabel} can be paid after you approve. You can still cancel in PayPal before anything is charged.`
            : `${unitLabel} won't be bought.`
        }
        confirmLabel={approving ? "Approve" : "Reject"}
        busyLabel={approving ? "Approving…" : "Rejecting…"}
        tone={approving ? "ok" : "danger"}
        busy={pending !== null}
        onCancel={() => {
          if (pending === null) setConfirm(null);
        }}
        onConfirm={() => {
          if (confirm) void review(confirm);
        }}
      />
    </div>
  );
}
