"use client";

import type { DecisionExplanation } from "@finpal/contracts";
import { useEffect, useState } from "react";

import { AutoAwesomeIcon } from "@/components/icons";
import { apiRequest, errorMessage } from "@/lib/api-client";

type State =
  | { status: "loading" }
  | { status: "ready"; explanation: DecisionExplanation }
  | { status: "error"; message: string };

/**
 * Groq's plain-language wording of a decision. Loaded per decision; the
 * outcome chip above stays the source of truth.
 */
export function DecisionSummary({ decisionId }: { decisionId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    apiRequest<DecisionExplanation>(`/api/v1/decisions/${decisionId}/explain`, {
      method: "POST",
    })
      .then((explanation) => {
        if (live) setState({ status: "ready", explanation });
      })
      .catch((error) => {
        if (live) setState({ status: "error", message: errorMessage(error) });
      });
    return () => {
      live = false;
    };
  }, [decisionId, attempt]);

  return (
    <section
      className="card summary-card"
      aria-labelledby="summary-title"
      aria-busy={state.status === "loading"}
    >
      <div className="summary-card__head">
        <AutoAwesomeIcon className="summary-card__icon" />
        <h3 id="summary-title">In plain words</h3>
        {state.status === "ready" ? (
          <span className="mono small ink4">
            {state.explanation.source === "llm"
              ? `Groq · ${state.explanation.model}`
              : "Rules"}
          </span>
        ) : null}
      </div>
      {state.status === "loading" ? (
        <div className="summary-card__skeleton" aria-hidden>
          <span />
          <span />
        </div>
      ) : state.status === "error" ? (
        <p className="summary-card__text ink3">
          {state.message}{" "}
          <button
            type="button"
            className="link-quiet"
            onClick={() => {
              setState({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </button>
        </p>
      ) : (
        <p className="summary-card__text fade-in">{state.explanation.text}</p>
      )}
      <p className="summary-card__note">
        AI wording only. The outcome is set by FinPal&apos;s rules and cannot be
        changed by the model.
      </p>
    </section>
  );
}
