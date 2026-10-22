"use client";

import type { DraftConstraintsResult } from "@finpal/contracts";
import { useState, type KeyboardEvent } from "react";

import { AutoAwesomeIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { apiRequest, errorMessage } from "@/lib/api-client";

const LABELS: Record<DraftConstraintsResult["changed"][number], string> = {
  currency: "currency",
  perPurchase: "per-purchase cap",
  daily: "daily cap",
  monthly: "monthly cap",
  timeWindows: "spending window",
};

/** Rules in plain words -> form fields. The user still saves the form. */
export function RulesDescriber({
  onDraft,
}: {
  onDraft: (result: DraftConstraintsResult) => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DraftConstraintsResult | null>(null);

  async function fill() {
    if (text.trim().length < 3 || pending) return;
    setPending(true);
    try {
      const draft = await apiRequest<DraftConstraintsResult>(
        "/api/v1/constraints/draft",
        { body: { text: text.trim() } },
      );
      setResult(draft);
      if (draft.changed.length) onDraft(draft);
    } catch (error) {
      toast(errorMessage(error), "bad");
    } finally {
      setPending(false);
    }
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    // Enter fills the form instead of saving it.
    if (event.key === "Enter") {
      event.preventDefault();
      void fill();
    }
  }

  return (
    <div className="field-group describe card describe-card">
      <label className="eyebrow" htmlFor="rules-input">
        Describe your rules
      </label>
      <div className="describe__row">
        <input
          id="rules-input"
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="e.g. No more than $200 a day or $1,500 a month, only on weekdays 9am to 6pm"
          maxLength={500}
          autoComplete="off"
          enterKeyHint="go"
        />
        <button
          type="button"
          className="btn btn-outline describe__go"
          onClick={() => void fill()}
          disabled={pending || text.trim().length < 3}
        >
          {pending ? (
            <span className="spinner" aria-hidden />
          ) : (
            <AutoAwesomeIcon aria-hidden />
          )}
          Fill form
        </button>
      </div>
      <p className="describe__note" role="status">
        {result
          ? result.changed.length
            ? `Filled the ${result.changed.map((f) => LABELS[f]).join(", ")}${
                result.source === "llm" ? ` with Groq (${result.model})` : ""
              }. Check the form, then save.`
            : "Couldn't find any rules in that. Try amounts with a period, like “$200 a day”."
          : "Fills the form below. Nothing changes until you save."}
      </p>
    </div>
  );
}
