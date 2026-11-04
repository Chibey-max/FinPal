"use client";

import type {
  Basket,
  ProposalEvaluation,
  TransferDraft,
} from "@finpal/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
} from "react";

import { MicIcon } from "@/components/icons";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { formatMoney, outcomeLabel, outcomeTone } from "@/features/app/present";
import { CheckoutButton } from "@/features/purchases/checkout-button";
import { ReviewActions } from "@/features/review/review-actions";
import { apiRequest, errorMessage } from "@/lib/api-client";

// The Web Speech API isn't in TypeScript's DOM types yet.
interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: (event: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void;
  onerror: (event: { error: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

function speechRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const speech = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => undefined;

const MIC_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it, or type the command.",
  "service-not-allowed":
    "Microphone access is blocked. Allow it, or type the command.",
  "no-speech": "Didn't catch that. Try again, or type the command.",
  network: "Voice needs a connection. Try again, or type the command.",
};

/**
 * Send money by voice or text. Speech recognition often mishears addresses, so
 * nothing happens until the person has read and confirmed what was heard.
 */
export function TransferConsole({ sandbox }: { sandbox: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<TransferDraft | null>(null);
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<ProposalEvaluation | null>(null);
  const [paid, setPaid] = useState<Basket | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  // False on the server, so its render and the first client render match.
  const canListen = useSyncExternalStore(
    noSubscribe,
    () => speechRecognition() !== null,
    () => false,
  );

  async function understand(command: string) {
    const trimmed = command.trim();
    if (trimmed.length < 3 || pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    setPaid(null);
    setReviewed(false);
    try {
      const parsed = await apiRequest<TransferDraft>(
        "/api/v1/agent/transfer/parse",
        { body: { text: trimmed } },
      );
      setDraft(parsed);
      setAmount(parsed.amount === null ? "" : String(parsed.amount));
      setEmail(parsed.recipientEmail ?? "");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  function toggleListening() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Speech = speechRecognition();
    if (!Speech) return;
    const session = new Speech();
    session.lang = navigator.language || "en-US";
    session.interimResults = false;
    let heard = "";
    session.onresult = (event) => {
      heard = event.results[0]?.[0]?.transcript ?? "";
      setText(heard);
    };
    session.onerror = (event) => {
      setError(MIC_ERRORS[event.error] ?? "Voice input failed. Type instead.");
    };
    session.onend = () => {
      setListening(false);
      if (heard) void understand(heard);
    };
    recognition.current = session;
    setError(null);
    setListening(true);
    session.start();
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || pending) return;
    setPending(true);
    setError(null);
    try {
      setResult(
        await apiRequest<ProposalEvaluation>("/api/v1/agent/transfer", {
          body: {
            text: text.trim(),
            amount: Number(amount),
            currency: draft.currency,
            recipientEmail: email.trim(),
          },
        }),
      );
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  const decision = result?.decision;
  const outcome = decision?.outcome;
  const canPay =
    outcome === "AUTO_APPROVE" || (outcome === "MANUAL_REVIEW" && reviewed);
  const total = Number(amount);
  const money = draft && total > 0 ? formatMoney(total, draft.currency) : "";

  return (
    <div className="stack-md">
      <form
        className="card agent-ask"
        onSubmit={(event) => {
          event.preventDefault();
          void understand(text);
        }}
      >
        <label className="eyebrow" htmlFor="transfer-command">
          Send money
        </label>
        <input
          id="transfer-command"
          className="input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Send $100 to someone@example.com"
          maxLength={300}
        />
        <div className="form-actions">
          {canListen ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={toggleListening}
              aria-pressed={listening}
            >
              <MicIcon aria-hidden />
              {listening ? "Listening… tap to stop" : "Speak"}
            </button>
          ) : null}
          <button
            type="submit"
            className="btn btn-outline"
            disabled={pending || text.trim().length < 3}
          >
            {pending && !result ? "Reading…" : "Continue"}
          </button>
        </div>
      </form>

      <div aria-live="polite" className="stack-md">
        {error ? (
          <p className="notice" data-tone="warn">
            {error}
          </p>
        ) : null}

        {draft && !result ? (
          <form className="card agent-ask fade-in" onSubmit={confirm}>
            <strong>Is this right?</strong>
            {draft.question ? (
              <p className="small ink3">{draft.question}</p>
            ) : (
              <p className="small ink3">
                Check the address letter by letter. Money sent to the wrong
                person may not come back.
              </p>
            )}
            <label className="small" htmlFor="transfer-amount">
              Amount ({draft.currency})
            </label>
            <input
              id="transfer-amount"
              className="input"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <label className="small" htmlFor="transfer-email">
              Recipient&apos;s email
            </label>
            <input
              id="transfer-email"
              className="input mono"
              type="email"
              required
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <div className="form-actions">
              <LiquidButton
                type="submit"
                size="xl"
                className="rounded-full text-[15px]"
                disabled={pending}
              >
                {pending ? <span className="spinner" aria-hidden /> : null}
                {pending ? "Checking your rules…" : "Check against my rules"}
              </LiquidButton>
            </div>
          </form>
        ) : null}

        {paid ? (
          <section className="card agent-done fade-in">
            <h2>{formatMoney(paid.total, paid.currency)} sent.</h2>
            <p>
              {paid.items[0]?.paypalCaptureStatus === "PENDING"
                ? `PayPal is holding it until ${email.trim()} claims it.`
                : `PayPal has paid ${email.trim()}.`}{" "}
              Every step is on record.
            </p>
            <Link href="/app/purchases?view=done" className="btn btn-outline">
              See your purchases
            </Link>
          </section>
        ) : null}

        {result && decision && outcome && !paid ? (
          <section className="card agent-item fade-in">
            <div className="agent-item__head">
              <div className="agent-item__title">
                <strong>{result.proposal.productName}</strong>
                <span className="mono small ink3">{money}</span>
              </div>
              <span className="chip" data-tone={outcomeTone[outcome]}>
                {outcomeLabel[outcome]}
              </span>
            </div>
            {outcome !== "AUTO_APPROVE" ? (
              <p className="small" data-tone={outcomeTone[outcome]}>
                {decision.reason}
              </p>
            ) : null}
            {outcome === "MANUAL_REVIEW" && !reviewed ? (
              <ReviewActions
                decisionId={decision.id}
                onDone={(action) => {
                  if (action === "APPROVED") setReviewed(true);
                  else setResult(null);
                }}
              />
            ) : null}
            {canPay ? (
              <CheckoutButton
                decisionIds={[decision.id]}
                idempotencyKey={`transfer_${decision.id}`}
                label={`Approve ${money} in PayPal`}
                summary={result.proposal.productName}
                payee={email.trim()}
                sandbox={sandbox}
                onPaid={(basket) => {
                  setPaid(basket);
                  startTransition(() => router.refresh());
                }}
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
