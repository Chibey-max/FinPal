"use client";

import type { SendDraft } from "@finpal/contracts";
import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatMoney } from "@/features/app/present";
import { apiRequest, errorMessage } from "@/lib/api-client";

const payoutLabel: Record<SendDraft["payoutStatus"], string> = {
  NONE: "Not sent",
  PENDING: "Pending at PayPal",
  SUCCESS: "Sent",
  UNCLAIMED: "Sent · unclaimed",
  FAILED: "Failed",
  RETURNED: "Returned",
};

function sendKey(draftId: string) {
  return `send_${draftId.replace(/-/g, "").slice(0, 24)}`;
}

function chipTone(draft: SendDraft): "bad" | "ok" | "warn" {
  if (draft.ruleOutcome === "BLOCK" || draft.payoutStatus === "FAILED") {
    return "bad";
  }
  if (draft.payoutStatus === "SUCCESS" || draft.payoutStatus === "UNCLAIMED") {
    return "ok";
  }
  return "warn";
}

// PayPal usually settles a payout within seconds to minutes.
const AUTO_CHECKS = 5;
const CHECK_EVERY_MS = 4000;

/** Approved, but PayPal never confirmed it: a crash or an outage. */
const isUnconfirmed = (draft: SendDraft) =>
  draft.status === "PAYING" && !draft.payoutBatchId;

function statusText(draft: SendDraft) {
  if (draft.ruleOutcome === "BLOCK") return "Blocked";
  if (draft.status === "DRAFT") return "Needs approval";
  if (isUnconfirmed(draft)) return "Not confirmed";
  if (draft.status === "PAYING") return "Paying…";
  if (draft.status === "SENT" || draft.status === "FAILED") {
    return payoutLabel[draft.payoutStatus];
  }
  return draft.status;
}

export function SendDraftCard({
  draft,
  onUpdate,
}: {
  draft: SendDraft;
  onUpdate: (next: SendDraft) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = (amount: number) => formatMoney(amount, draft.currency);
  const canApprove =
    draft.status === "DRAFT" && draft.ruleOutcome === "MANUAL_REVIEW";
  // Retrying sends the same key, so PayPal returns the first result.
  const canFinish = isUnconfirmed(draft);
  const canRefresh = Boolean(draft.payoutBatchId);
  const settling =
    draft.status === "SENT" &&
    (draft.payoutStatus === "PENDING" || draft.payoutStatus === "NONE");

  // Check a pending payout a few times on its own, outside any request.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });
  const [checks, setChecks] = useState({ id: draft.id, count: 0 });
  const checksDone = checks.id === draft.id ? checks.count : 0;
  useEffect(() => {
    if (!settling || checksDone >= AUTO_CHECKS) return;
    const timer = setTimeout(async () => {
      try {
        const next = await apiRequest<SendDraft>(
          `/api/v1/sends/${draft.id}/refresh`,
          { method: "POST", body: {} },
        );
        onUpdateRef.current(next);
      } catch {
        // Refresh status stays available.
      }
      setChecks({ id: draft.id, count: checksDone + 1 });
    }, CHECK_EVERY_MS);
    return () => clearTimeout(timer);
  }, [settling, checksDone, draft.id]);

  async function approve() {
    if ((!canApprove && !canFinish) || pending) return;
    setPending(true);
    setError(null);
    try {
      const next = await apiRequest<SendDraft>(
        `/api/v1/sends/${draft.id}/approve`,
        {
          body: {
            draftId: draft.id,
            idempotencyKey: sendKey(draft.id),
          },
        },
      );
      onUpdate(next);
      setConfirm(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function refresh() {
    if (!canRefresh || pending) return;
    setPending(true);
    setError(null);
    try {
      const next = await apiRequest<SendDraft>(
        `/api/v1/sends/${draft.id}/refresh`,
        { method: "POST", body: {} },
      );
      onUpdate(next);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card agent-send fade-in" aria-labelledby="send-draft">
      <header className="agent-send__head">
        <div>
          <span className="eyebrow">Send draft</span>
          <h2 id="send-draft">
            {money(draft.amount)} to {draft.recipientEmail}
          </h2>
          <p className="small ink3">
            {draft.memo ? draft.memo : "No memo"} · PayPal Payouts · Sandbox
          </p>
        </div>
        <div className="agent-send__status">
          <span className="chip" data-tone={chipTone(draft)}>
            {statusText(draft)}
          </span>
        </div>
      </header>

      <dl className="agent-send__facts">
        {/* Only when PayPal shares the balance with this app. */}
        {draft.availableAtDraft !== null ? (
          <div>
            <dt>Wallet when drafted</dt>
            <dd className="mono">{money(draft.availableAtDraft)}</dd>
          </div>
        ) : null}
        {draft.balanceAfterSend !== null ? (
          <div>
            <dt>After this send</dt>
            <dd className="mono">{money(draft.balanceAfterSend)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{draft.status === "FAILED" ? "Why it failed" : "Rules"}</dt>
          <dd>{draft.ruleReason}</dd>
        </div>
        {canFinish ? (
          <div>
            <dt>PayPal</dt>
            <dd>
              PayPal didn&apos;t confirm this send. Finish sending checks again
              with the same request, so PayPal pays it at most once.
            </dd>
          </div>
        ) : null}
        {draft.payoutStatus === "UNCLAIMED" ? (
          <div>
            <dt>Claim</dt>
            <dd>
              PayPal emailed the recipient. No account yet → funds stay
              unclaimed (~30 days), then return.
            </dd>
          </div>
        ) : null}
      </dl>

      {error ? (
        <p className="notice" data-tone="warn">
          {error}
        </p>
      ) : null}

      <div className="agent-send__actions">
        {canApprove ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => setConfirm(true)}
          >
            Approve &amp; pay
          </button>
        ) : null}
        {canFinish ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => void approve()}
          >
            {pending ? "Checking…" : "Finish sending"}
          </button>
        ) : null}
        {canRefresh ? (
          <button
            type="button"
            className="btn btn-outline"
            disabled={pending}
            onClick={() => void refresh()}
          >
            Refresh status
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirm}
        title="Send from Sandbox wallet?"
        description={`Pay ${money(draft.amount)} to ${draft.recipientEmail} via PayPal Payouts. Money leaves the FinPal Sandbox business wallet only after you confirm.`}
        confirmLabel="Approve & pay"
        busyLabel="Sending…"
        busy={pending}
        onCancel={() => {
          if (!pending) setConfirm(false);
        }}
        onConfirm={() => void approve()}
      />
    </section>
  );
}
