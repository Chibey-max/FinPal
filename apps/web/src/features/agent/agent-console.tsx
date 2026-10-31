"use client";

import type {
  AgentListResult,
  AgentRun,
  Basket,
  EventSuggestion,
  EventSuggestions,
} from "@finpal/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import { AutoAwesomeIcon } from "@/components/icons";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import {
  formatEventDate,
  formatMoney,
  outcomeLabel,
  outcomeTone,
} from "@/features/app/present";
import { CheckoutButton } from "@/features/purchases/checkout-button";
import { ReviewActions } from "@/features/review/review-actions";
import { apiRequest, errorMessage } from "@/lib/api-client";

const EXAMPLES = [
  "Noise-cancelling headphones under $350, a portable charger and an ergonomic office chair",
  "A birthday gift for my brother and a travel backpack",
];

// Shown while the request runs; the real result replaces them.
const WORKING = [
  "Reading your list",
  "Searching real offers",
  "Comparing products and merchants",
  "Checking each one against your rules",
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

export function AgentConsole({
  timeZone,
  sandbox,
  initialList,
}: {
  timeZone: string;
  sandbox: boolean;
  initialList: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [list, setList] = useState(initialList);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState(0);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [paid, setPaid] = useState<Basket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(
      () => setStep((s) => Math.min(s + 1, WORKING.length - 1)),
      1400,
    );
    return () => clearInterval(timer);
  }, [pending]);

  const refreshSide = () => startTransition(() => router.refresh());

  async function shop(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 3 || pending) return;
    setStep(0);
    setPending(true);
    setError(null);
    setPaid(null);
    setRuns([]);
    setExcluded(new Set());
    try {
      const result = await apiRequest<AgentListResult>("/api/v1/agent/list", {
        body: { list: trimmed },
      });
      setRuns(result.runs);
      setList("");
      refreshSide();
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        }),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void shop(list);
  }

  function addSuggestion(suggestion: EventSuggestion) {
    setList((current) =>
      current.trim()
        ? `${current.trim()}\n${suggestion.need}`
        : suggestion.need,
    );
    inputRef.current?.focus();
  }

  function replaceRun(index: number, run: AgentRun) {
    setRuns((current) => current.map((r, i) => (i === index ? run : r)));
    refreshSide();
  }

  const selected = useMemo(
    () =>
      runs.filter(
        (run) => payable(run) && run.decision && !excluded.has(run.decision.id),
      ),
    [runs, excluded],
  );
  const currency = selected[0]?.brief.currency ?? "USD";
  const total =
    selected.reduce(
      (sum, run) => sum + Math.round((run.pick?.price ?? 0) * 100),
      0,
    ) / 100;

  return (
    <div className="agent-layout">
      <div className="stack-lg">
        <form className="card agent-ask" onSubmit={submit}>
          <label className="eyebrow" htmlFor="agent-list">
            Your shopping list
          </label>
          <textarea
            ref={inputRef}
            id="agent-list"
            className="input agent-ask__input"
            rows={3}
            value={list}
            onChange={(e) => setList(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void shop(list);
              }
            }}
            placeholder="One item or several: headphones under $200, a travel adapter, a birthday gift for my brother…"
            maxLength={1000}
          />
          {runs.length === 0 && !pending ? (
            <div className="agent-ask__examples">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="preset"
                  onClick={() => setList(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          ) : null}
          <div className="form-actions">
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
              {pending ? "Shopping…" : "Let the agent shop"}
            </LiquidButton>
            <Link href="/app/proposals/new" className="link-quiet">
              Add one item by hand
            </Link>
          </div>
        </form>

        <div ref={resultRef} aria-live="polite" className="stack-md">
          {pending ? (
            <ol className="card agent-steps">
              {WORKING.map((label, i) => (
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
          ) : null}
          {error ? (
            <p className="notice" data-tone="warn">
              {error}
            </p>
          ) : null}

          {paid ? (
            <section className="card agent-done fade-in">
              <h2>Done. {formatMoney(paid.total, paid.currency)} paid.</h2>
              <p>
                {paid.items.length === 1
                  ? "Your item is"
                  : `All ${paid.items.length} items are`}{" "}
                bought, and every step is on record.
              </p>
              <Link href="/app/purchases?view=done" className="btn btn-outline">
                See your purchases
              </Link>
            </section>
          ) : null}

          {!paid &&
            runs.map((run, index) => (
              <AgentItem
                key={`${run.need}-${run.decision?.id ?? index}`}
                run={run}
                timeZone={timeZone}
                included={run.decision ? !excluded.has(run.decision.id) : false}
                onToggle={(id) =>
                  setExcluded((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onReplace={(next) => replaceRun(index, next)}
              />
            ))}

          {!paid && selected.length ? (
            <div className="card agent-basket fade-in">
              <div>
                <span className="eyebrow">Ready to buy</span>
                <strong>
                  {selected.length} {selected.length === 1 ? "item" : "items"} ·{" "}
                  {formatMoney(total, currency)}
                </strong>
                <span className="small ink3">
                  You approve once in PayPal. The agent does the rest.
                </span>
              </div>
              <CheckoutButton
                decisionIds={selected.map((run) => run.decision!.id)}
                idempotencyKey={basketKeyFor(selected)}
                label={`Approve ${formatMoney(total, currency)}`}
                summary={
                  selected.length === 1
                    ? (selected[0]?.pick?.title ?? "FinPal purchase")
                    : `${selected.length} items`
                }
                sandbox={sandbox}
                onPaid={(basket) => {
                  setPaid(basket);
                  setRuns([]);
                  refreshSide();
                }}
              />
            </div>
          ) : null}
        </div>
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

function AgentItem({
  run,
  included,
  onToggle,
  onReplace,
}: {
  run: AgentRun;
  timeZone: string;
  included: boolean;
  onToggle: (decisionId: string) => void;
  onReplace: (run: AgentRun) => void;
}) {
  const { pick, decision, brief } = run;
  const money = (n: number) => formatMoney(n, brief.currency);

  if (run.status === "NEEDS_DETAIL") {
    return <AgentQuestion run={run} onReplace={onReplace} />;
  }
  if (!pick || !decision) {
    return (
      <section className="card agent-item fade-in">
        <div className="agent-item__head">
          <strong>{run.need}</strong>
          <span className="chip" data-tone="muted">
            Not found
          </span>
        </div>
        <p className="small ink3">{NOT_FOUND[run.status]}</p>
      </section>
    );
  }

  const reviewed = decision.reviewStatus;
  const needsReview = decision.outcome === "MANUAL_REVIEW" && !reviewed;
  const canSelect = payable(run);
  const status = reviewed
    ? reviewed === "APPROVED"
      ? "Approved by you"
      : "Rejected"
    : outcomeLabel[decision.outcome];
  const tone =
    reviewed === "APPROVED"
      ? "ok"
      : reviewed === "REJECTED"
        ? "bad"
        : outcomeTone[decision.outcome];

  return (
    <section className="card agent-item fade-in">
      <div className="agent-item__head">
        {canSelect ? (
          <input
            type="checkbox"
            className="agent-item__check"
            checked={included}
            onChange={() => onToggle(decision.id)}
            aria-label={`Include ${pick.title} in the basket`}
          />
        ) : null}
        <div className="agent-item__title">
          <span className="small ink4">For “{run.need}”</span>
          <strong>{pick.title}</strong>
          <span className="small ink3">
            {pick.merchant} · <span className="mono">{money(pick.price)}</span>
          </span>
        </div>
        <span className="chip" data-tone={tone}>
          {status}
        </span>
      </div>
      {run.reason ? <p className="agent-item__reason">{run.reason}</p> : null}
      {decision.outcome !== "AUTO_APPROVE" || run.hold ? (
        <p className="small" data-tone={run.hold ? "warn" : tone}>
          {run.hold ?? decision.reason}
        </p>
      ) : null}
      {needsReview ? (
        <ReviewActions
          decisionId={decision.id}
          onDone={(action) =>
            onReplace({
              ...run,
              decision: { ...decision, reviewStatus: action },
            })
          }
        />
      ) : null}
      <details className="agent-item__more">
        <summary>
          What it compared ({run.candidates.length} of {run.offersFound} offers)
        </summary>
        <ul className="agent-offers">
          {run.candidates.map((c) => (
            <li
              key={`${c.productId}-${c.merchant}`}
              data-picked={
                pick.productId === c.productId && pick.merchant === c.merchant
                  ? true
                  : undefined
              }
            >
              <span className="truncate">{c.title}</span>
              <span className="small ink3">{c.merchant}</span>
              <span className="mono">{money(c.price)}</span>
            </li>
          ))}
        </ul>
        <Link href={`/app/purchases/${decision.id}`} className="link-quiet">
          Open the full evidence
        </Link>
      </details>
    </section>
  );
}

/** The agent asks one question, then shops for that item straight away. */
function AgentQuestion({
  run,
  onReplace,
}: {
  run: AgentRun;
  onReplace: (run: AgentRun) => void;
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
      onReplace(
        await apiRequest<AgentRun>("/api/v1/agent/shop", {
          body: { need: `${run.need}: ${answer.trim()}`.slice(0, 300) },
        }),
      );
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
