"use client";

import type {
  AgentListResult,
  AgentRun,
  Basket,
  EventSuggestion,
  EventSuggestions,
  SendDraft,
  WalletSummary,
} from "@finpal/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { AutoAwesomeIcon } from "@/components/icons";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import {
  clearAgentSession,
  readAgentSession,
  writeAgentSession,
} from "@/features/agent/agent-session";
import { SendDraftCard } from "@/features/agent/send-draft-card";
import { SnapSearchButton } from "@/features/agent/snap-search";
import { VoiceDictationButton } from "@/features/agent/voice-dictation";
import {
  formatEventDate,
  formatMoney,
  outcomeLabel,
  outcomeTone,
} from "@/features/app/present";
import { CheckoutButton } from "@/features/purchases/checkout-button";
import { ReviewActions } from "@/features/review/review-actions";
import { apiRequest, errorMessage } from "@/lib/api-client";

// Same shape the server parses: it starts by asking to send, has an amount,
// and names one recipient after "to". A list that mentions "pay" or an
// email address is shopping.
function looksLikeSend(text: string) {
  return /^\s*(?:please\s+)?(?:send|pay|transfer|payout)\b[^@]*\d[^@]*\bto\s*:?\s*[^\s@]+@[^\s@]+\.[^\s@]+/i.test(
    text,
  );
}

function looksLikeBalance(text: string) {
  return /^(what'?s?\s+(my\s+)?balance|balance(\?)?|how much (do i |have i got |have )?(i\s+)?(got|have|left)|wallet)\b/i.test(
    text.trim(),
  );
}

type ChatTurn = {
  id: string;
  role: "user" | "agent";
  text: string;
};

function summarizeRuns(runs: AgentRun[]) {
  const withPick = runs.filter((run) => run.pick).length;
  const needDetail = runs.filter((run) => run.status === "NEEDS_DETAIL").length;
  const needReview = runs.filter(
    (run) =>
      run.decision?.outcome === "MANUAL_REVIEW" && !run.decision.reviewStatus,
  ).length;
  const parts = [
    `Checked ${runs.length} ${runs.length === 1 ? "line" : "lines"}`,
    withPick
      ? `found offers for ${withPick}`
      : "couldn't find matching offers yet",
  ];
  if (needDetail) {
    parts.push(
      `${needDetail} need${needDetail === 1 ? "s" : ""} a quick detail from you`,
    );
  }
  if (needReview) {
    parts.push(
      `${needReview} need${needReview === 1 ? "s" : ""} your review before pay`,
    );
  }
  return `${parts.join(" · ")}.`;
}

const EXAMPLES = [
  "Noise-cancelling headphones under $350, a portable charger and an ergonomic office chair",
  "Send $40 to friend@example.com for birthday",
  "What's my balance?",
];

// Shown while the request runs; the real result replaces them.
const WORKING = [
  "Reading your list",
  "Searching real offers",
  "Comparing products and merchants",
  "Checking each line against your rules",
];

const SEND_WORKING = [
  "Reading your send",
  "Checking Sandbox balance",
  "Checking your rules",
];

const NOT_FOUND: Partial<Record<AgentRun["status"], string>> = {
  NO_OFFERS: "No new, in-stock offers for this. Try describing it differently.",
  OVER_BUDGET: "Offers exist, but none fit that budget.",
  SEARCH_FAILED:
    "The price search is unavailable right now. Try again shortly.",
};

const payable = (run: AgentRun) =>
  run.decision !== null &&
  run.hold === null &&
  (run.decision.outcome === "AUTO_APPROVE" ||
    (run.decision.outcome === "MANUAL_REVIEW" &&
      run.decision.reviewStatus === "APPROVED"));

/** Same items, same key: a retry reuses the PayPal order instead of adding one. */
function basketKeyFor(runs: AgentRun[]) {
  const ids = runs
    .map((run) => run.decision?.id ?? "")
    .sort()
    .join();
  let a = 5381;
  let b = 52711;
  for (let i = 0; i < ids.length; i++) {
    a = (a * 33) ^ ids.charCodeAt(i);
    b = (b * 31) ^ ids.charCodeAt(i);
  }
  return `basket_${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${runs.length}`;
}

/** Strip " (1 of 2)" / "2 × " so quantity units group on the bill. */
function needBase(need: string) {
  return need
    .replace(/\s*\(\d+\s+of\s+\d+\)\s*$/i, "")
    .replace(/^\d+\s*[×x]\s*/i, "")
    .trim();
}

type BillLine = {
  key: string;
  label: string;
  runs: AgentRun[];
  indexes: number[];
};

function buildBillLines(runs: AgentRun[]): BillLine[] {
  const lines: BillLine[] = [];
  const byKey = new Map<string, BillLine>();

  runs.forEach((run, index) => {
    if (run.status === "NEEDS_DETAIL") return;
    const pick = run.pick;
    const key = pick
      ? `pick:${pick.productId}|${pick.merchant}|${pick.price}|${needBase(run.need)}`
      : `miss:${needBase(run.need)}|${run.status}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.runs.push(run);
      existing.indexes.push(index);
      return;
    }
    const line: BillLine = {
      key,
      label: needBase(run.need),
      runs: [run],
      indexes: [index],
    };
    byKey.set(key, line);
    lines.push(line);
  });
  return lines;
}

interface AgentConsoleProps {
  timeZone: string;
  sandbox: boolean;
  initialList: string;
}

const noSubscribe = () => () => undefined;

/**
 * The server can't see this device's saved thread, so the console first
 * renders empty (matching the server HTML), then mounts again in the
 * browser with the thread restored.
 */
export function AgentConsole(props: AgentConsoleProps) {
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return (
    <AgentConsoleView
      key={inBrowser ? "browser" : "server"}
      {...props}
      restore={inBrowser}
    />
  );
}

function AgentConsoleView({
  timeZone,
  sandbox,
  initialList,
  restore,
}: AgentConsoleProps & { restore: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saved] = useState(() => (restore ? readAgentSession() : null));
  const [list, setList] = useState(initialList || saved?.list || "");
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState(0);
  const [runs, setRuns] = useState<AgentRun[]>(saved?.runs ?? []);
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(saved?.excluded ?? []),
  );
  const [paid, setPaid] = useState<Basket | null>(saved?.paid ?? null);
  const [sendDraft, setSendDraft] = useState<SendDraft | null>(
    saved?.sendDraft ?? null,
  );
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [mode, setMode] = useState<"shop" | "send" | "balance">("shop");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>(saved?.turns ?? []);
  const resultRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  async function loadWallet() {
    try {
      const next = await apiRequest<WalletSummary>("/api/v1/paypal/wallet");
      setWallet(next);
      return next;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (!restore) return;
    let live = true;
    apiRequest<WalletSummary>("/api/v1/paypal/wallet")
      .then((next) => {
        if (live) setWallet(next);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [restore]);

  useEffect(() => {
    if (!restore || pending) return;
    writeAgentSession({
      list,
      turns,
      runs,
      paid,
      excluded: [...excluded],
      sendDraft,
    });
  }, [restore, pending, list, turns, runs, paid, excluded, sendDraft]);

  useEffect(() => {
    if (!pending) return;
    const labels = mode === "send" ? SEND_WORKING : WORKING;
    const timer = setInterval(
      () => setStep((s) => Math.min(s + 1, labels.length - 1)),
      1400,
    );
    return () => clearInterval(timer);
  }, [pending, mode]);

  // Lenis preventDefault's window wheel; drive this pane natively and instantly.
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      el.scrollTop += event.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const refreshSide = () => startTransition(() => router.refresh());

  function pushAgent(text: string) {
    setTurns((current) => [
      ...current,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `a-${Date.now()}`,
        role: "agent",
        text,
      },
    ]);
  }

  async function askBalance() {
    setMode("balance");
    setStep(0);
    setPending(true);
    setError(null);
    setList("");
    try {
      const next = await loadWallet();
      if (!next) {
        pushAgent(
          "I couldn't read the Sandbox wallet right now. Try again in a moment.",
        );
        return;
      }
      const sendable = formatMoney(next.sendableToday, next.currency);
      if (!next.connected || next.available === null) {
        pushAgent(
          `Connect your PayPal account in Settings, then top up your FinPal balance before sending. You can send up to ${sendable} today once funded.`,
        );
        return;
      }
      pushAgent(
        `Your FinPal balance is ${formatMoney(next.available, next.currency)} (${next.paypalEmail ?? next.accountLabel}). You can send up to ${sendable} today (FinPal allows ${formatMoney(next.dailyLimit, next.currency)} a day).`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
      pushAgent("I couldn't read your FinPal balance.");
    } finally {
      setPending(false);
    }
  }

  async function sendFunds(trimmed: string) {
    setMode("send");
    setStep(0);
    setPending(true);
    setError(null);
    setPaid(null);
    setRuns([]);
    setExcluded(new Set());
    setSendDraft(null);
    setList("");
    requestAnimationFrame(() =>
      threadRef.current?.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: "smooth",
      }),
    );
    try {
      const draft = await apiRequest<SendDraft>("/api/v1/sends", {
        body: { message: trimmed },
      });
      setSendDraft(draft);
      pushAgent(
        draft.ruleOutcome === "BLOCK"
          ? `Draft ready, but blocked: ${draft.ruleReason}`
          : `Draft ready: ${formatMoney(draft.amount, draft.currency)} to ${draft.recipientEmail}. Approve & pay when you're ready — I never move money myself.`,
      );
      void loadWallet();
      refreshSide();
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        }),
      );
    } catch (caught) {
      setError(errorMessage(caught));
      pushAgent(
        "I couldn't draft that send. Try: Send $40 to name@email.com for birthday.",
      );
    } finally {
      setPending(false);
    }
  }

  async function shop(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 3 || pending) return;
    setMode("shop");
    setStep(0);
    setPending(true);
    setError(null);
    setPaid(null);
    setSendDraft(null);
    setRuns([]);
    setExcluded(new Set());
    setList("");
    requestAnimationFrame(() =>
      threadRef.current?.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: "smooth",
      }),
    );
    try {
      const result = await apiRequest<AgentListResult>("/api/v1/agent/list", {
        body: { list: trimmed },
      });
      setRuns(result.runs);
      pushAgent(summarizeRuns(result.runs));
      refreshSide();
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        }),
      );
    } catch (caught) {
      setError(errorMessage(caught));
      pushAgent("I couldn't shop that list. Edit it and try again.");
    } finally {
      setPending(false);
    }
  }

  async function handlePrompt(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 3 || pending) return;
    const userTurn: ChatTurn = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `u-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setTurns((current) => [...current, userTurn]);
    requestAnimationFrame(() =>
      threadRef.current?.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: "smooth",
      }),
    );
    if (looksLikeBalance(trimmed)) {
      await askBalance();
      return;
    }
    if (looksLikeSend(trimmed)) {
      await sendFunds(trimmed);
      return;
    }
    await shop(trimmed);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handlePrompt(list);
  }

  const canClear =
    turns.length > 0 ||
    runs.length > 0 ||
    Boolean(sendDraft) ||
    Boolean(paid) ||
    Boolean(list.trim()) ||
    Boolean(error);

  function clearChat() {
    if (pending || !canClear) return;
    clearAgentSession();
    setList("");
    setTurns([]);
    setRuns([]);
    setExcluded(new Set());
    setPaid(null);
    setSendDraft(null);
    setError(null);
    setStep(0);
    setMode("shop");
    inputRef.current?.focus();
  }

  function addSuggestion(suggestion: EventSuggestion) {
    setList((current) =>
      current.trim()
        ? `${current.trim()}\n${suggestion.need}`
        : suggestion.need,
    );
    inputRef.current?.focus();
  }

  function replaceRun(index: number, next: AgentRun | AgentRun[]) {
    const units = Array.isArray(next) ? next : [next];
    setRuns((current) => [
      ...current.slice(0, index),
      ...units,
      ...current.slice(index + 1),
    ]);
    refreshSide();
  }

  function replaceRunsAt(
    indexes: number[],
    patch: (run: AgentRun) => AgentRun,
  ) {
    const set = new Set(indexes);
    setRuns((current) =>
      current.map((run, index) => (set.has(index) ? patch(run) : run)),
    );
    refreshSide();
  }

  const questions = useMemo(
    () =>
      runs
        .map((run, index) => ({ run, index }))
        .filter(({ run }) => run.status === "NEEDS_DETAIL"),
    [runs],
  );
  const lines = useMemo(() => buildBillLines(runs), [runs]);
  const selected = useMemo(
    () =>
      runs.filter(
        (run) => payable(run) && run.decision && !excluded.has(run.decision.id),
      ),
    [runs, excluded],
  );
  const currency =
    selected[0]?.brief.currency ??
    runs.find((run) => run.brief.currency)?.brief.currency ??
    "USD";
  const total =
    selected.reduce(
      (sum, run) => sum + Math.round((run.pick?.price ?? 0) * 100),
      0,
    ) / 100;
  const heldCount = runs.filter((run) => run.hold).length;
  const reviewCount = runs.filter(
    (run) =>
      run.decision?.outcome === "MANUAL_REVIEW" && !run.decision.reviewStatus,
  ).length;

  const showEmptyHints = turns.length === 0 && !pending && runs.length === 0;

  return (
    <div className="agent-layout">
      <div className="agent-chat card">
        <div
          ref={threadRef}
          className="agent-chat__thread"
          data-lenis-prevent
          aria-live="polite"
        >
          {showEmptyHints ? (
            <div className="agent-chat__empty">
              <p className="agent-chat__empty-title">
                Type, speak, snap, or pick an example
              </p>
              <p className="small ink3">
                Shop a list or send funds from the Sandbox wallet. Your rules
                check every move, and nothing leaves until you approve.
              </p>
              <div className="agent-ask__examples">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="preset"
                    onClick={() => {
                      setList(example);
                      inputRef.current?.focus();
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((turn) => (
            <div key={turn.id} className="agent-bubble" data-role={turn.role}>
              <span className="agent-bubble__who">
                {turn.role === "user" ? "You" : "FinPal"}
              </span>
              <p>{turn.text}</p>
            </div>
          ))}

          {pending && mode !== "balance" ? (
            <div className="agent-bubble" data-role="agent" data-pending>
              <span className="agent-bubble__who">FinPal</span>
              <ol className="agent-steps agent-steps--inline">
                {(mode === "send" ? SEND_WORKING : WORKING).map((label, i) => (
                  <li
                    key={label}
                    data-state={
                      i < step ? "done" : i === step ? "active" : "todo"
                    }
                  >
                    {label}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {error ? (
            <p className="notice" data-tone="warn">
              {error}
            </p>
          ) : null}

          <div ref={resultRef} className="agent-chat__results stack-md">
            {paid ? (
              <section className="agent-done fade-in">
                <h2>Done. {formatMoney(paid.total, paid.currency)} paid.</h2>
                <p>
                  {paid.items.length === 1
                    ? "Your item is"
                    : `All ${paid.items.length} items are`}{" "}
                  bought, and every step is on record.
                </p>
                <Link
                  href="/app/purchases?view=done"
                  className="btn btn-outline"
                >
                  See your purchases
                </Link>
              </section>
            ) : null}

            {!paid && sendDraft ? (
              <SendDraftCard
                draft={sendDraft}
                onUpdate={(next) => {
                  setSendDraft(next);
                  if (next.status === "SENT") {
                    pushAgent(
                      next.payoutStatus === "UNCLAIMED"
                        ? `Sent ${formatMoney(next.amount, next.currency)} — recipient has not claimed it yet (UNCLAIMED).`
                        : `Sent ${formatMoney(next.amount, next.currency)} to ${next.recipientEmail}. Status: ${next.payoutStatus}.`,
                    );
                    void loadWallet();
                    refreshSide();
                  }
                }}
              />
            ) : null}

            {!paid &&
              !sendDraft &&
              questions.map(({ run, index }) => (
                <AgentQuestion
                  key={`ask-${run.need}-${index}`}
                  run={run}
                  onReplace={(next) => replaceRun(index, next)}
                />
              ))}

            {!paid && !sendDraft && lines.length > 0 ? (
              <OrderBill
                lines={lines}
                currency={currency}
                total={total}
                selected={selected}
                excluded={excluded}
                heldCount={heldCount}
                reviewCount={reviewCount}
                sandbox={sandbox}
                onToggleLine={(decisionIds) => {
                  setExcluded((current) => {
                    const next = new Set(current);
                    const allIn = decisionIds.every((id) => next.has(id));
                    for (const id of decisionIds) {
                      if (allIn) next.delete(id);
                      else next.add(id);
                    }
                    return next;
                  });
                }}
                onSetExcluded={(ids, exclude) => {
                  setExcluded((current) => {
                    const next = new Set(current);
                    for (const id of ids) {
                      if (exclude) next.add(id);
                      else next.delete(id);
                    }
                    return next;
                  });
                }}
                onReviewLine={(indexes, action) =>
                  replaceRunsAt(indexes, (run) =>
                    run.decision
                      ? {
                          ...run,
                          decision: {
                            ...run.decision,
                            reviewStatus: action,
                          },
                        }
                      : run,
                  )
                }
                onPaid={(basket) => {
                  setPaid(basket);
                  setRuns([]);
                  setTurns((current) => [
                    ...current,
                    {
                      id:
                        typeof crypto !== "undefined" && "randomUUID" in crypto
                          ? crypto.randomUUID()
                          : `p-${Date.now()}`,
                      role: "agent",
                      text: `Paid ${formatMoney(basket.total, basket.currency)}. Your purchases are on record.`,
                    },
                  ]);
                  refreshSide();
                }}
              />
            ) : null}
          </div>
        </div>

        <form className="agent-ask agent-ask--compose" onSubmit={submit}>
          {wallet ? (
            <div className="agent-wallet" aria-live="polite">
              <span className="agent-wallet__label">You can send today</span>
              <strong className="mono">
                {formatMoney(wallet.sendableToday, wallet.currency)}
              </strong>
              <span className="agent-wallet__meta">
                {wallet.connected && wallet.available !== null
                  ? `${formatMoney(wallet.available, wallet.currency)} FinPal balance · ${wallet.paypalEmail ?? wallet.accountLabel}`
                  : "Connect PayPal to fund your FinPal balance"}
              </span>
            </div>
          ) : null}
          <div className="agent-ask__toolbar">
            <label className="eyebrow" htmlFor="agent-list">
              {turns.length ? "Shop or send" : "Shop a list or send funds"}
            </label>
            <div className="agent-ask__tools">
              {canClear ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm agent-ask__clear"
                  disabled={pending}
                  onClick={clearChat}
                >
                  Clear chat
                </button>
              ) : null}
              <SnapSearchButton
                value={list}
                onChange={setList}
                disabled={pending}
                onError={(message) => setError(message)}
              />
              <VoiceDictationButton
                value={list}
                onChange={setList}
                disabled={pending}
                onError={(message) => setError(message)}
              />
            </div>
          </div>
          <textarea
            ref={inputRef}
            id="agent-list"
            className="input agent-ask__input"
            rows={3}
            value={list}
            onChange={(e) => setList(e.target.value)}
            onKeyDown={(e) => {
              // Enter runs; Shift+Enter inserts a new line in the list.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handlePrompt(list);
              }
            }}
            placeholder="Shop: headphones under $200 · Send: $40 to name@email.com"
            maxLength={1000}
            disabled={pending}
          />
          <div className="form-actions agent-ask__actions">
            <LiquidButton
              type="submit"
              size="xl"
              className="rounded-full text-[15px]"
              disabled={pending}
              aria-disabled={list.trim().length < 3 || pending}
            >
              {pending ? (
                <span className="spinner" aria-hidden />
              ) : (
                <AutoAwesomeIcon aria-hidden />
              )}
              {pending
                ? mode === "send"
                  ? "Drafting send…"
                  : mode === "balance"
                    ? "Checking…"
                    : "Shopping…"
                : "Go"}
            </LiquidButton>
            <span
              className="small ink4 agent-ask__hint"
              title="Enter to go · Snap a product · Say stop to end voice"
            >
              Enter to go · Snap a product · Say “stop” to end voice
            </span>
            <Link href="/app/proposals/new" className="link-quiet">
              Add one item by hand
            </Link>
          </div>
        </form>
      </div>

      <aside className="stack-lg">
        <Suggestions
          timeZone={timeZone}
          disabled={pending}
          onPick={addSuggestion}
        />
      </aside>
    </div>
  );
}

type BillBucket = "review" | "ready" | "out";

function lineBucket(line: BillLine): BillBucket {
  const sample = line.runs[0]!;
  if (!sample.pick || !sample.decision) return "out";
  if (sample.hold) return "out";
  if (sample.decision.outcome === "BLOCK") return "out";
  if (sample.decision.reviewStatus === "REJECTED") return "out";
  if (
    sample.decision.outcome === "MANUAL_REVIEW" &&
    !sample.decision.reviewStatus
  ) {
    return "review";
  }
  if (line.runs.every(payable)) return "ready";
  return "out";
}

function decisionIdsFor(line: BillLine) {
  return line.runs
    .map((run) => run.decision?.id)
    .filter((id): id is string => Boolean(id));
}

async function reviewMany(ids: string[], action: "APPROVED" | "REJECTED") {
  const unique = [...new Set(ids)];
  for (const id of unique) {
    await apiRequest(`/api/v1/decisions/${id}/review`, {
      body: { action },
    });
  }
}

function OrderBill({
  lines,
  currency,
  total,
  selected,
  excluded,
  heldCount,
  reviewCount,
  sandbox,
  onToggleLine,
  onSetExcluded,
  onReviewLine,
  onPaid,
}: {
  lines: BillLine[];
  currency: string;
  total: number;
  selected: AgentRun[];
  excluded: Set<string>;
  heldCount: number;
  reviewCount: number;
  sandbox: boolean;
  onToggleLine: (decisionIds: string[]) => void;
  onSetExcluded: (decisionIds: string[], exclude: boolean) => void;
  onReviewLine: (indexes: number[], action: "APPROVED" | "REJECTED") => void;
  onPaid: (basket: Basket) => void;
}) {
  const money = (n: number) => formatMoney(n, currency);
  const [bulkConfirm, setBulkConfirm] = useState<
    "APPROVED" | "REJECTED" | null
  >(null);
  const [bulkPending, setBulkPending] = useState<
    "APPROVED" | "REJECTED" | null
  >(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const unitCount = lines.reduce((sum, line) => sum + line.runs.length, 0);
  const groups = useMemo(() => {
    const review: BillLine[] = [];
    const ready: BillLine[] = [];
    const out: BillLine[] = [];
    for (const line of lines) {
      const bucket = lineBucket(line);
      if (bucket === "review") review.push(line);
      else if (bucket === "ready") ready.push(line);
      else out.push(line);
    }
    return { review, ready, out };
  }, [lines]);

  const readyIds = useMemo(
    () => groups.ready.flatMap(decisionIdsFor),
    [groups.ready],
  );
  const reviewMeta = useMemo(() => {
    const ids: string[] = [];
    const indexes: number[] = [];
    for (const line of groups.review) {
      ids.push(...decisionIdsFor(line));
      indexes.push(...line.indexes);
    }
    return { ids: [...new Set(ids)], indexes };
  }, [groups.review]);

  async function bulkReview(action: "APPROVED" | "REJECTED") {
    if (!reviewMeta.ids.length || bulkPending) return;
    setBulkPending(action);
    setBulkError(null);
    try {
      await reviewMany(reviewMeta.ids, action);
      onReviewLine(reviewMeta.indexes, action);
      setBulkConfirm(null);
    } catch (caught) {
      setBulkError(errorMessage(caught));
    } finally {
      setBulkPending(null);
    }
  }

  const bulkCount = reviewMeta.ids.length;
  const bulkApproving = bulkConfirm === "APPROVED";

  return (
    <section className="card agent-bill fade-in" aria-labelledby="order-bill">
      <header className="agent-bill__head">
        <div className="agent-bill__head-copy">
          <span className="eyebrow">Order draft</span>
          <h2 id="order-bill">Your bill</h2>
          <p className="small ink3">
            {lines.length} {lines.length === 1 ? "line" : "lines"} · {unitCount}{" "}
            {unitCount === 1 ? "unit" : "units"} · rules already applied
          </p>
        </div>
        <div className="agent-bill__summary-card">
          <span className="eyebrow">Pay now</span>
          <strong className="mono agent-bill__total">{money(total)}</strong>
          <span className="small ink3">
            {selected.length
              ? `${selected.length} selected`
              : "Nothing selected"}
          </span>
          {selected.length ? (
            <CheckoutButton
              decisionIds={selected.map((run) => run.decision!.id)}
              idempotencyKey={basketKeyFor(selected)}
              label={`Pay ${money(total)}`}
              summary={
                selected.length === 1
                  ? (selected[0]?.pick?.title ?? "FinPal purchase")
                  : `${selected.length} items`
              }
              sandbox={sandbox}
              onPaid={onPaid}
            />
          ) : null}
        </div>
      </header>

      <div className="agent-bill__flags">
        {reviewCount ? (
          <span className="chip" data-tone="warn">
            {reviewCount} need you
          </span>
        ) : null}
        {heldCount ? (
          <span className="chip" data-tone="warn">
            {heldCount} held
          </span>
        ) : null}
        {selected.length ? (
          <span className="chip" data-tone="ok">
            {selected.length} ready
          </span>
        ) : null}
      </div>

      {groups.review.length ? (
        <BillGroup
          title="Needs your review"
          count={groups.review.length}
          actions={
            <>
              <button
                type="button"
                className="btn btn-outline"
                disabled={bulkPending !== null}
                onClick={() => setBulkConfirm("APPROVED")}
              >
                Approve all
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={bulkPending !== null}
                onClick={() => setBulkConfirm("REJECTED")}
              >
                Reject all
              </button>
            </>
          }
        >
          {bulkError ? (
            <p className="small" data-tone="bad">
              {bulkError}
            </p>
          ) : null}
          <div className="agent-bill__table" role="table">
            <div className="agent-bill__thead" role="row">
              <span>Item</span>
              <span>Qty</span>
              <span>Total</span>
              <span>Status</span>
            </div>
            {groups.review.map((line) => (
              <BillLineRow
                key={line.key}
                line={line}
                money={money}
                excluded={excluded}
                onToggle={onToggleLine}
                onReview={onReviewLine}
              />
            ))}
          </div>
        </BillGroup>
      ) : null}

      {groups.ready.length ? (
        <BillGroup
          title="Ready to pay"
          count={groups.ready.length}
          actions={
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onSetExcluded(readyIds, false)}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onSetExcluded(readyIds, true)}
              >
                Clear selection
              </button>
            </>
          }
        >
          <div className="agent-bill__table" role="table">
            <div className="agent-bill__thead" role="row">
              <span>Item</span>
              <span>Qty</span>
              <span>Total</span>
              <span>Status</span>
            </div>
            {groups.ready.map((line) => (
              <BillLineRow
                key={line.key}
                line={line}
                money={money}
                excluded={excluded}
                onToggle={onToggleLine}
                onReview={onReviewLine}
              />
            ))}
          </div>
        </BillGroup>
      ) : null}

      {groups.out.length ? (
        <details className="agent-bill__group agent-bill__group--collapsed">
          <summary className="agent-bill__group-summary">
            <span>
              Not on this bill · {groups.out.length}{" "}
              {groups.out.length === 1 ? "line" : "lines"}
            </span>
            <span className="small ink4">
              Blocked, held, rejected or missing
            </span>
          </summary>
          <div className="agent-bill__table" role="table">
            {groups.out.map((line) => (
              <BillLineRow
                key={line.key}
                line={line}
                money={money}
                excluded={excluded}
                onToggle={onToggleLine}
                onReview={onReviewLine}
              />
            ))}
          </div>
        </details>
      ) : null}

      <footer className="agent-bill__foot">
        <div className="agent-bill__totals">
          <span className="eyebrow">Subtotal</span>
          <strong className="mono agent-bill__total">{money(total)}</strong>
          <span className="small ink3">
            {selected.length
              ? `${selected.length} payable · one PayPal approval`
              : "Select ready lines or finish reviews"}
          </span>
        </div>
        {selected.length ? (
          <CheckoutButton
            decisionIds={selected.map((run) => run.decision!.id)}
            idempotencyKey={basketKeyFor(selected)}
            label={`Pay ${money(total)}`}
            summary={
              selected.length === 1
                ? (selected[0]?.pick?.title ?? "FinPal purchase")
                : `${selected.length} items`
            }
            sandbox={sandbox}
            onPaid={onPaid}
          />
        ) : null}
      </footer>

      <ConfirmDialog
        open={bulkConfirm !== null}
        title={
          bulkApproving
            ? `Approve all ${bulkCount} waiting ${bulkCount === 1 ? "item" : "items"}?`
            : `Reject all ${bulkCount} waiting ${bulkCount === 1 ? "item" : "items"}?`
        }
        description={
          bulkApproving
            ? "Approved items can be paid. Nothing is charged until you approve in PayPal."
            : "Rejected items won't be bought."
        }
        confirmLabel={bulkApproving ? "Approve all" : "Reject all"}
        busyLabel={bulkApproving ? "Approving…" : "Rejecting…"}
        tone={bulkApproving ? "ok" : "danger"}
        busy={bulkPending !== null}
        onCancel={() => {
          if (bulkPending === null) setBulkConfirm(null);
        }}
        onConfirm={() => {
          if (bulkConfirm) void bulkReview(bulkConfirm);
        }}
      />
    </section>
  );
}

function BillGroup({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="agent-bill__group">
      <div className="agent-bill__group-head">
        <div>
          <h3>
            {title}
            <span className="agent-bill__count">{count}</span>
          </h3>
        </div>
        {actions ? <div className="agent-bill__bulk">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

function BillLineRow({
  line,
  money,
  excluded,
  onToggle,
  onReview,
}: {
  line: BillLine;
  money: (n: number) => string;
  excluded: Set<string>;
  onToggle: (decisionIds: string[]) => void;
  onReview: (indexes: number[], action: "APPROVED" | "REJECTED") => void;
}) {
  const sample = line.runs[0]!;
  const pick = sample.pick;
  const decision = sample.decision;
  const qty = line.runs.length;
  const unit = pick?.price ?? 0;
  const lineTotal = (Math.round(unit * 100) * qty) / 100;
  const decisionIds = decisionIdsFor(line);
  const canSelect = line.runs.every(payable);
  const included =
    canSelect &&
    decisionIds.length > 0 &&
    decisionIds.every((id) => !excluded.has(id));
  const needsReview = line.runs.some(
    (run) =>
      run.decision?.outcome === "MANUAL_REVIEW" && !run.decision.reviewStatus,
  );
  const hold = line.runs.find((run) => run.hold)?.hold ?? null;
  const reviewed = decision?.reviewStatus;
  const status = !pick
    ? "Not found"
    : reviewed
      ? reviewed === "APPROVED"
        ? "Approved"
        : "Rejected"
      : hold
        ? "Held"
        : decision
          ? outcomeLabel[decision.outcome]
          : "Not found";
  const tone = !pick
    ? "muted"
    : reviewed === "APPROVED"
      ? "ok"
      : reviewed === "REJECTED"
        ? "bad"
        : hold
          ? "warn"
          : decision
            ? outcomeTone[decision.outcome]
            : "muted";
  // Show the blocking/hold reason for out lines too (rejected keeps reviewStatus).
  const ruleNote =
    hold ??
    (decision &&
    ((decision.outcome !== "AUTO_APPROVE" && !decision.reviewStatus) ||
      decision.outcome === "BLOCK" ||
      decision.reviewStatus === "REJECTED")
      ? decision.reason
      : null);

  return (
    <div className="agent-bill__line" data-tone={tone} role="row">
      <div className="agent-bill__row">
        {canSelect ? (
          <input
            type="checkbox"
            className="agent-bill__check"
            checked={included}
            onChange={() => onToggle(decisionIds)}
            aria-label={`Include ${pick?.title ?? line.label} on the bill`}
          />
        ) : (
          <span className="agent-bill__check-spacer" aria-hidden />
        )}

        {pick?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- host varies per merchant CDN
          <img
            className="agent-bill__thumb"
            src={pick.imageUrl}
            alt=""
            width={44}
            height={44}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            className="agent-bill__thumb agent-bill__thumb--empty"
            aria-hidden
          />
        )}

        <div className="agent-bill__product">
          <strong className="agent-bill__title">
            {pick?.title ?? line.label}
          </strong>
          <span className="agent-bill__merchant">
            {pick
              ? `${line.label} · ${pick.merchant} · ${money(unit)}`
              : `${line.label} · ${NOT_FOUND[sample.status] ?? "Not found"}`}
          </span>
        </div>

        <span className="agent-bill__qty mono" aria-label={`Quantity ${qty}`}>
          {qty}
        </span>

        <span className="agent-bill__amount mono">
          {pick ? money(lineTotal) : "—"}
        </span>

        <span className="chip" data-tone={tone}>
          {status}
        </span>
      </div>

      {needsReview && decision ? (
        <div className="agent-bill__actions">
          <ReviewActions
            decisionId={decision.id}
            decisionIds={decisionIds}
            subject={pick?.title ?? line.label}
            onDone={(action) => onReview(line.indexes, action)}
          />
        </div>
      ) : null}

      {pick || ruleNote || sample.reason ? (
        <details className="agent-bill__more">
          <summary>Why this decision</summary>
          {ruleNote ? (
            <p className="agent-bill__rule" data-tone={hold ? "warn" : tone}>
              {ruleNote}
            </p>
          ) : null}
          {sample.reason ? (
            <p className="agent-bill__reason">{sample.reason}</p>
          ) : null}
          {pick && decision ? (
            <>
              <ul className="agent-offers">
                {sample.candidates.map((c) => (
                  <li
                    key={`${c.productId}-${c.merchant}`}
                    data-picked={
                      pick.productId === c.productId &&
                      pick.merchant === c.merchant
                        ? true
                        : undefined
                    }
                  >
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="agent-offers__thumb"
                        src={c.imageUrl}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span
                        className="agent-offers__thumb agent-offers__thumb--empty"
                        aria-hidden
                      />
                    )}
                    <span className="truncate">{c.title}</span>
                    <span className="small ink3">{c.merchant}</span>
                    <span className="mono">{money(c.price)}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/app/purchases/${decision.id}`}
                className="link-quiet"
              >
                Full evidence
              </Link>
            </>
          ) : null}
          {!pick ? (
            <p className="small ink3">
              {NOT_FOUND[sample.status] ??
                "No offer was submitted for this line."}
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

/** The agent asks one question, then shops for that item straight away. */
function AgentQuestion({
  run,
  onReplace,
}: {
  run: AgentRun;
  onReplace: (run: AgentRun | AgentRun[]) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (answer.trim().length < 2) return;
    setPending(true);
    setError(null);
    try {
      const result = await apiRequest<AgentListResult>("/api/v1/agent/shop", {
        body: { need: `${run.need}: ${answer.trim()}`.slice(0, 300) },
      });
      onReplace(result.runs);
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <form className="card agent-item fade-in" onSubmit={send}>
      <div className="agent-item__head">
        <div className="agent-item__title">
          <span className="small ink4">For “{run.need}”</span>
          <strong>{run.question}</strong>
        </div>
        <span className="chip" data-tone="info">
          Agent asks
        </span>
      </div>
      <div className="describe__row">
        <input
          className="input"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer"
          maxLength={200}
          autoComplete="off"
          aria-label={run.question ?? "Your answer"}
        />
        <button
          type="submit"
          className="btn btn-outline describe__go"
          disabled={pending || answer.trim().length < 2}
        >
          {pending ? <span className="spinner" aria-hidden /> : null}
          Continue
        </button>
      </div>
      {error ? (
        <p className="small" data-tone="bad">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function Suggestions({
  timeZone,
  disabled,
  onPick,
}: {
  timeZone: string;
  disabled: boolean;
  onPick: (suggestion: EventSuggestion) => void;
}) {
  const [data, setData] = useState<EventSuggestions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiRequest<EventSuggestions>("/api/v1/agent/suggestions")
      .then((value) => live && setData(value))
      .catch((caught) => live && setError(errorMessage(caught)));
    return () => {
      live = false;
    };
  }, []);

  return (
    <section
      className="card stack-card"
      aria-labelledby="suggestions-title"
      aria-busy={!data && !error}
    >
      <div className="summary-card__head">
        <AutoAwesomeIcon className="summary-card__icon" />
        <h3 id="suggestions-title">Suggested for you</h3>
      </div>
      {error ? (
        <p className="small ink3">{error}</p>
      ) : !data ? (
        <div className="summary-card__skeleton" aria-hidden>
          <span />
          <span />
        </div>
      ) : data.suggestions.length === 0 ? (
        <p className="small ink3">
          Nothing yet. Ideas appear as you buy things and when upcoming events
          call for something.
        </p>
      ) : (
        <ul className="agent-suggestions">
          {data.suggestions.map((suggestion) => (
            <li key={`${suggestion.eventId}-${suggestion.need}`}>
              <button
                type="button"
                className="agent-suggestion"
                disabled={disabled}
                onClick={() => onPick(suggestion)}
              >
                <strong>+ {suggestion.need}</strong>
                <span className="small ink3">{suggestion.reason}</span>
                {suggestion.startsAt ? (
                  <span className="mono small ink4">
                    {suggestion.eventTitle} ·{" "}
                    {formatEventDate(suggestion.startsAt, timeZone)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {data?.suggestions.length ? (
        <p className="summary-card__note">
          Tap to add to your list. Based on your purchases and calendar.
        </p>
      ) : null}
    </section>
  );
}
