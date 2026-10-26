"use client";

import type {
  AgentRun,
  EventSuggestion,
  EventSuggestions,
} from "@finpal/contracts";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AutoAwesomeIcon } from "@/components/icons";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import {
  formatEventDate,
  formatMoney,
  outcomeTone,
} from "@/features/app/present";
import {
  DecisionActions,
  type DecisionActionState,
} from "@/features/decisions/decision-actions";
import { apiRequest, errorMessage } from "@/lib/api-client";

import { ForecastCard } from "./forecast-card";

const EXAMPLES = [
  "Noise-cancelling headphones under $350 before my trip on Friday",
  "An ergonomic office chair, max $600",
  "A portable charger for the offsite",
];

// Shown while the request runs; the real steps replace them on reply.
const WORKING = [
  "Reading your need",
  "Searching Channel3 for real offers",
  "Comparing products and merchants",
  "Submitting the proposal",
  "Running FinPal's rules",
];

const NOT_PROPOSED: Record<Exclude<AgentRun["status"], "PROPOSED">, string> = {
  NO_OFFERS:
    "Channel3 found no new, in-stock offers for that. Try describing the product differently.",
  OVER_BUDGET:
    "Offers exist, but none fit the budget. Nothing was proposed. Raise the budget or change the need.",
  SEARCH_FAILED:
    "Channel3 couldn't be searched right now (or your currency isn't supported). Nothing was proposed.",
};

function actionFor(run: AgentRun): DecisionActionState | null {
  if (!run.decision) return null;
  if (run.decision.outcome === "BLOCK") return { kind: "blocked" };
  if (run.decision.outcome === "MANUAL_REVIEW") return { kind: "review" };
  return { kind: "pay" };
}

export function AgentConsole({ timeZone }: { timeZone: string }) {
  const [need, setNeed] = useState("");
  const [eventId, setEventId] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState(0);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(
      () => setStep((s) => Math.min(s + 1, WORKING.length - 1)),
      1100,
    );
    return () => clearInterval(timer);
  }, [pending]);

  async function shop(text: string, fromEvent?: string) {
    const trimmed = text.trim();
    if (trimmed.length < 3 || pending) return;
    setStep(0);
    setPending(true);
    setError(null);
    setRun(null);
    try {
      const result = await apiRequest<AgentRun>("/api/v1/agent/shop", {
        body: { need: trimmed, eventId: fromEvent },
      });
      setRun(result);
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
    void shop(need, eventId);
  }

  function fromSuggestion(suggestion: EventSuggestion) {
    setNeed(suggestion.need);
    setEventId(suggestion.eventId);
    void shop(suggestion.need, suggestion.eventId);
  }

  return (
    <div className="agent-layout">
      <div className="stack-lg">
        <form className="card agent-ask" onSubmit={submit}>
          <label className="eyebrow" htmlFor="agent-need">
            What do you need?
          </label>
          <textarea
            id="agent-need"
            className="input agent-ask__input"
            rows={2}
            value={need}
            onChange={(e) => {
              setNeed(e.target.value);
              setEventId(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void shop(need, eventId);
              }
            }}
            placeholder="e.g. Noise-cancelling headphones under $350 before my trip on Friday"
            maxLength={300}
          />
          <div className="agent-ask__examples">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="preset"
                onClick={() => {
                  setNeed(example);
                  setEventId(undefined);
                }}
              >
                {example}
              </button>
            ))}
          </div>
          <div className="form-actions">
            <LiquidButton
              type="submit"
              size="xl"
              className="rounded-full text-[15px]"
              disabled={pending}
              aria-disabled={need.trim().length < 3 || pending}
            >
              {pending ? (
                <span className="spinner" aria-hidden />
              ) : (
                <AutoAwesomeIcon aria-hidden />
              )}
              {pending ? "Agent is shopping…" : "Let the agent shop"}
            </LiquidButton>
            <span className="endpoint">POST /api/v1/agent/shop</span>
          </div>
          <p className="footnote">
            The agent submits one proposal. FinPal&apos;s rules decide whether
            it&apos;s approved, and nothing is paid until you approve it in
            PayPal.
          </p>
        </form>

        <div ref={resultRef} aria-live="polite">
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
          ) : error ? (
            <p className="notice" data-tone="warn">
              {error}
            </p>
          ) : run ? (
            <AgentResult run={run} />
          ) : null}
        </div>
      </div>

      <aside className="stack-lg">
        <Suggestions
          timeZone={timeZone}
          disabled={pending}
          onPick={fromSuggestion}
        />
        <ForecastCard timeZone={timeZone} />
      </aside>
    </div>
  );
}

function AgentResult({ run }: { run: AgentRun }) {
  const { brief, pick, decision } = run;
  const money = (n: number) => formatMoney(n, brief.currency);
  const action = actionFor(run);

  return (
    <div className="stack-md fade-in">
      <ol className="card agent-steps agent-steps--done">
        <li data-state="done">
          <span>
            Searched for <strong>{brief.query}</strong>
            {brief.maxPrice !== null ? ` under ${money(brief.maxPrice)}` : ""}
          </span>
          {brief.mustHaves.length ? (
            <span className="agent-tags">
              {brief.mustHaves.map((item) => (
                <span key={item} className="chip" data-tone="muted">
                  {item}
                </span>
              ))}
            </span>
          ) : null}
        </li>
        <li data-state={run.offersFound ? "done" : "failed"}>
          Channel3 returned {run.offersFound} usable{" "}
          {run.offersFound === 1 ? "offer" : "offers"}
        </li>
        {run.candidates.length ? (
          <li data-state="done">
            Compared {run.candidates.length}{" "}
            {run.candidates.length === 1 ? "product" : "products"}
            <ul className="agent-offers">
              {run.candidates.map((c) => (
                <li
                  key={`${c.productId}-${c.merchant}`}
                  data-picked={
                    pick?.productId === c.productId &&
                    pick.merchant === c.merchant
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
          </li>
        ) : null}
        {run.status !== "PROPOSED" ? (
          <li data-state="failed">{NOT_PROPOSED[run.status]}</li>
        ) : null}
      </ol>

      {pick && decision ? (
        <section className="card agent-pick" aria-labelledby="agent-pick">
          <div className="detail-head">
            <div className="stack-sm">
              <span className="eyebrow">Agent&apos;s pick</span>
              <h2 id="agent-pick" className="agent-pick__title">
                {pick.title} <span className="ink3">{money(pick.price)}</span>
              </h2>
              <span className="small ink3">from {pick.merchant}</span>
            </div>
            <span
              className="chip chip-lg"
              data-tone={outcomeTone[decision.outcome]}
            >
              {decision.outcome}
            </span>
          </div>
          {run.reason ? (
            <p className="summary-card__text">{run.reason}</p>
          ) : null}
          <p className="agent-pick__rules">
            <span className="eyebrow">FinPal&apos;s rules</span>{" "}
            {decision.reason}
          </p>
          <p className="summary-card__note">
            {run.source === "llm"
              ? `Search and pick by Groq · ${run.model}. `
              : "Search and pick by FinPal's built-in rules. "}
            The outcome is set by the rules, never by the agent.{" "}
            <Link href={`/app/decisions/${decision.id}`} className="link-quiet">
              Open the full evidence
            </Link>
          </p>
        </section>
      ) : null}

      {action && decision ? (
        <DecisionActions decisionId={decision.id} state={action} />
      ) : null}
    </div>
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
        <h3 id="suggestions-title">From your calendar</h3>
      </div>
      {error ? (
        <p className="small ink3">{error}</p>
      ) : !data ? (
        <div className="summary-card__skeleton" aria-hidden>
          <span />
          <span />
        </div>
      ) : !data.calendarConfigured ? (
        <p className="small ink3">
          No calendar is connected, so there&apos;s nothing to suggest yet.
        </p>
      ) : data.suggestions.length === 0 ? (
        <p className="small ink3">
          Nothing in the next three weeks looks like it needs a purchase.
        </p>
      ) : (
        <ul className="agent-suggestions">
          {data.suggestions.map((suggestion) => (
            <li key={suggestion.eventId} className="fade-in">
              <span className="mono small ink4">
                {suggestion.eventTitle} ·{" "}
                {formatEventDate(suggestion.startsAt, timeZone)}
              </span>
              <strong>{suggestion.need}</strong>
              <span className="small ink3">{suggestion.reason}</span>
              <button
                type="button"
                className="btn btn-outline agent-suggestions__go"
                disabled={disabled}
                onClick={() => onPick(suggestion)}
              >
                Shop for this
              </button>
            </li>
          ))}
        </ul>
      )}
      {data ? (
        <p className="summary-card__note">
          {data.source === "llm" ? `Ideas by Groq · ${data.model}. ` : ""}
          Suggestions only. The agent shops when you pick one.
        </p>
      ) : null}
    </section>
  );
}
