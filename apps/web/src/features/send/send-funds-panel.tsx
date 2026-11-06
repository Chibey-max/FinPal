"use client";

import type { SendDraft, WalletSummary } from "@finpal/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { SendDraftCard } from "@/features/agent/send-draft-card";
import { formatMoney, formatWhen } from "@/features/app/present";
import { apiRequest, errorMessage } from "@/lib/api-client";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AMOUNT = /^\d{1,7}(\.\d{1,2})?$/;

const DEMO_RECIPIENTS = [
  { email: "friend@example.com", label: "Demo (unclaimed)" },
  { email: "unclaimed@example.com", label: "Unclaimed demo" },
];

const statusTone: Record<
  SendDraft["status"] | SendDraft["payoutStatus"],
  string | undefined
> = {
  DRAFT: "warn",
  APPROVED: "warn",
  PAYING: "warn",
  SENT: "ok",
  FAILED: "bad",
  NONE: undefined,
  PENDING: "warn",
  SUCCESS: "ok",
  UNCLAIMED: "warn",
  RETURNED: "bad",
};

function validate(amount: string, email: string) {
  if (!AMOUNT.test(amount.trim()) || Number(amount) <= 0) {
    return "Enter an amount like 40.00.";
  }
  if (Number(amount) > 1_000_000) return "Amount is capped at 1,000,000.";
  if (!EMAIL.test(email.trim())) return "Enter a valid recipient email.";
  return null;
}

function statusLabel(draft: SendDraft) {
  if (draft.ruleOutcome === "BLOCK") return "Blocked";
  if (draft.status === "DRAFT") return "Needs approval";
  if (draft.status === "PAYING") return "Paying…";
  if (draft.payoutStatus === "UNCLAIMED") return "Sent · unclaimed";
  if (draft.payoutStatus === "SUCCESS") return "Sent";
  if (draft.payoutStatus === "PENDING") return "Pending";
  if (draft.payoutStatus === "FAILED" || draft.status === "FAILED") {
    return "Failed";
  }
  if (draft.payoutStatus === "RETURNED") return "Returned";
  return draft.status;
}

/** Form + active draft + history — the dedicated Send money surface. */
export function SendFundsPanel({
  wallet: initialWallet,
  initialSends,
  timeZone,
}: {
  wallet: WalletSummary | null;
  initialSends: SendDraft[];
  timeZone: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [memo, setMemo] = useState("");
  const [wallet, setWallet] = useState(initialWallet);
  const [draft, setDraft] = useState<SendDraft | null>(
    () =>
      initialSends.find(
        (row) => row.status === "DRAFT" || row.status === "PAYING",
      ) ?? null,
  );
  const [history, setHistory] = useState(initialSends);
  const [pending, setPending] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("50.00");
  const [error, setError] = useState<string | null>(null);

  const problem = validate(amount, recipientEmail);
  const connected = wallet?.connected === true;

  async function refreshWallet() {
    try {
      const next = await apiRequest<WalletSummary>("/api/v1/paypal/wallet");
      setWallet(next);
    } catch {
      // Keep the last known wallet strip.
    }
  }

  async function refreshHistory() {
    try {
      const page = await apiRequest<{ sends: SendDraft[] }>("/api/v1/sends");
      setHistory(page.sends);
    } catch {
      // Keep the list we already have.
    }
  }

  function upsertHistory(next: SendDraft) {
    setHistory((current) => {
      const without = current.filter((row) => row.id !== next.id);
      return [next, ...without].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!connected) {
      setError("Connect your PayPal account before sending.");
      return;
    }
    const message = validate(amount, recipientEmail);
    if (message || pending) {
      setError(message);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const next = await apiRequest<SendDraft>("/api/v1/sends", {
        body: {
          amount: Number(amount),
          currency: wallet?.currency ?? "USD",
          recipientEmail: recipientEmail.trim(),
          memo: memo.trim() || null,
        },
      });
      setDraft(next);
      upsertHistory(next);
      setAmount("");
      setMemo("");
      void refreshWallet();
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function onTopUp() {
    if (!connected || toppingUp) return;
    const value = Number(topUpAmount);
    if (!Number.isFinite(value) || value < 1) {
      setError("Enter a top-up of at least $1.00.");
      return;
    }
    setToppingUp(true);
    setError(null);
    try {
      const session = await apiRequest<{
        approveUrl: string | null;
        orderId: string;
      }>("/api/v1/paypal/wallet/top-up", {
        body: { amount: value, currency: "USD" },
      });
      if (session.approveUrl) {
        window.location.href = session.approveUrl;
        return;
      }
      // Mock mode credits immediately.
      await refreshWallet();
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setToppingUp(false);
    }
  }

  return (
    <div className="send-layout">
      <section className="card send-compose stack-md">
        <div className="send-compose__wallet">
          <div>
            <span className="eyebrow">You can send today</span>
            <p className="send-compose__balance mono">
              {wallet
                ? formatMoney(wallet.sendableToday, wallet.currency)
                : "—"}
            </p>
            <p className="small ink3">
              {!wallet
                ? "Couldn’t reach your FinPal balance right now."
                : !wallet.connected
                  ? "Connect PayPal, then top up your personal FinPal ledger from Sandbox Checkout."
                  : wallet.available !== null
                    ? `${formatMoney(wallet.available, wallet.currency)} in your FinPal ledger (${wallet.paypalEmail ?? wallet.accountLabel}). Daily send cap ${formatMoney(wallet.dailyLimit, wallet.currency)}. Payouts leave FinPal’s Sandbox merchant, not your PayPal cash.`
                    : "Connect PayPal to fund your FinPal ledger."}
            </p>
          </div>
          <div className="stack-sm" style={{ alignItems: "flex-end" }}>
            {!connected ? (
              <a
                href="/api/v1/paypal/connect"
                className="btn btn-outline btn-sm"
              >
                Connect PayPal
              </a>
            ) : (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => void refreshWallet()}
              >
                Refresh
              </button>
            )}
          </div>
        </div>

        {connected ? (
          <div className="field-grid">
            <label className="field">
              <span>Top up (USD)</span>
              <input
                className="input input--inset mono"
                inputMode="decimal"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="50.00"
                autoComplete="off"
                disabled={toppingUp}
              />
            </label>
            <div className="form-actions" style={{ alignItems: "flex-end" }}>
              <button
                type="button"
                className="btn btn-outline"
                disabled={toppingUp}
                onClick={() => void onTopUp()}
              >
                {toppingUp ? "Starting…" : "Top up from PayPal"}
              </button>
            </div>
          </div>
        ) : null}

        <form className="stack-md" onSubmit={onSubmit} noValidate>
          <div className="field-grid">
            <label className="field">
              <span>Amount (USD)</span>
              <input
                className="input input--inset mono"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="40.00"
                autoComplete="off"
                disabled={pending || !connected}
              />
            </label>
            <label className="field">
              <span>Recipient email</span>
              <input
                className="input input--inset"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="name@email.com"
                autoComplete="off"
                disabled={pending || !connected}
              />
            </label>
          </div>

          <label className="field">
            <span>Memo (optional)</span>
            <input
              className="input input--inset"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Birthday, rent share…"
              maxLength={200}
              disabled={pending || !connected}
            />
          </label>

          <div className="preset-row">
            {DEMO_RECIPIENTS.map((preset) => (
              <button
                key={preset.email}
                type="button"
                className="preset"
                disabled={pending || !connected}
                onClick={() => setRecipientEmail(preset.email)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {error ? (
            <p className="notice" data-tone="warn">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <LiquidButton
              type="submit"
              size="xl"
              className="rounded-full text-[15px]"
              disabled={pending || !connected || problem !== null}
            >
              {pending ? "Checking…" : "Review send"}
            </LiquidButton>
            <span className="small ink4">
              Debits your FinPal balance only after you Approve &amp; pay.
            </span>
          </div>
        </form>
      </section>

      <div className="send-side stack-lg">
        {draft ? (
          <SendDraftCard
            draft={draft}
            onUpdate={(next) => {
              setDraft(next);
              upsertHistory(next);
              void refreshWallet();
              void refreshHistory();
              startTransition(() => router.refresh());
            }}
          />
        ) : (
          <div className="empty-panel empty-panel--left">
            <p>
              Connect PayPal, top up the FinPal ledger via Checkout, then send.
              After you approve, Payouts leave FinPal&apos;s Sandbox merchant —
              not the connected user&apos;s PayPal balance. Use Demo (unclaimed)
              or a Personal US sandbox email, not a Business account.
            </p>
          </div>
        )}

        <section className="card send-history" aria-labelledby="send-history">
          <header className="send-history__head">
            <div>
              <span className="eyebrow">Recent</span>
              <h2 id="send-history">Send history</h2>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void refreshHistory()}
            >
              Refresh
            </button>
          </header>

          {history.length === 0 ? (
            <p className="small ink3">No sends yet.</p>
          ) : (
            <table className="send-history__table">
              <thead>
                <tr className="send-history__thead">
                  <th>When</th>
                  <th>To</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td colSpan={4} className="send-history__cell">
                      <button
                        type="button"
                        className="send-history__row"
                        onClick={() => setDraft(row)}
                      >
                        <span className="small ink3">
                          {formatWhen(row.updatedAt, timeZone)}
                        </span>
                        <span className="send-history__email">
                          {row.recipientEmail}
                        </span>
                        <span className="mono">
                          {formatMoney(row.amount, row.currency)}
                        </span>
                        <span
                          className="chip"
                          data-tone={
                            row.payoutStatus === "FAILED" ||
                            row.status === "FAILED"
                              ? "bad"
                              : row.payoutStatus === "SUCCESS" ||
                                  row.payoutStatus === "UNCLAIMED"
                                ? "ok"
                                : (statusTone[row.status] ?? "warn")
                          }
                        >
                          {statusLabel(row)}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
