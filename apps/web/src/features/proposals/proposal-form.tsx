"use client";

import type {
  Proposal,
  ProposalEvaluation,
  TrustSignal,
} from "@finpal/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { useToast } from "@/components/toast";
import { Select } from "@/components/ui/select";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { apiRequest, errorMessage } from "@/lib/api-client";
import { localDate, zonedToDate } from "@/lib/zoned";

import {
  PRESETS,
  type EventContext,
  type PresetKey,
  type ProposalDraft,
} from "./presets";

const PRICE = /^\d{1,7}(\.\d{1,2})?$/;
const TRUST_OPTIONS: TrustSignal[] = [
  "NOT_CHECKED",
  "PASS",
  "FAIL",
  "UNAVAILABLE",
];

function validate(draft: ProposalDraft) {
  if (!draft.name.trim()) return "Product name is required.";
  if (!PRICE.test(draft.price.trim()) || Number(draft.price) <= 0) {
    return "Enter a price like 329.00.";
  }
  if (Number(draft.price) > 1_000_000) return "Prices are capped at 1,000,000.";
  return null;
}

export function ProposalForm({
  initial,
  event,
  timeZone,
  currencies,
  simulateTrust,
  catalog,
  presetActive,
}: {
  initial: ProposalDraft;
  event: EventContext | null;
  timeZone: string;
  currencies: string[];
  /** Mock mode: show the KERNEL (simulated) selector. */
  simulateTrust: boolean;
  /** Mock mode: product names the simulated Channel3 knows. */
  catalog: string[];
  presetActive: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<ProposalDraft>(initial);
  const [eventContext, setEventContext] = useState(event);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const valid = validate(draft) === null;

  function clearPresetParam() {
    if (presetActive && window.location.search.includes("preset=")) {
      window.history.replaceState(null, "", "/app/proposals/new");
    }
  }

  function update<K extends keyof ProposalDraft>(
    key: K,
    value: ProposalDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
    clearPresetParam();
  }

  function applyPreset(key: PresetKey) {
    setDraft({ ...PRESETS[key].draft, source: "MANUAL" });
    setEventContext(null);
    setError(null);
    window.history.replaceState(
      null,
      "",
      ["auto", "review", "blocked"].includes(key)
        ? `/app/proposals/new?preset=${key}`
        : "/app/proposals/new",
    );
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const problem = validate(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const date = eventContext?.date ?? localDate(new Date(), timeZone);
      const proposal = await apiRequest<Proposal>("/api/v1/proposals", {
        body: {
          productName: draft.name.trim(),
          proposedPrice: Number(draft.price),
          currency: draft.currency,
          source: draft.source,
          sourceEventId: eventContext?.id,
          proposedFor: zonedToDate(date, draft.time, timeZone).toISOString(),
          ...(simulateTrust ? { simulation: { trust: draft.trust } } : {}),
        },
      });
      const result = await apiRequest<ProposalEvaluation>(
        "/api/v1/evaluations",
        {
          body: { proposalId: proposal.id },
        },
      );
      startTransition(() => {
        router.push(`/app/decisions/${result.decision.id}`);
        router.refresh();
      });
    } catch (caught) {
      setPending(false);
      setError(errorMessage(caught));
      toast(errorMessage(caught), "bad");
    }
  }

  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      {eventContext ? (
        <div className="context-banner fade-in">
          <span>
            From event: <strong>{eventContext.title}</strong> ·{" "}
            {eventContext.label}
          </span>
          <button
            type="button"
            className="link-quiet small"
            onClick={() => {
              setEventContext(null);
              update("source", "MANUAL");
            }}
          >
            Clear
          </button>
        </div>
      ) : null}

      <div className="field-group">
        <span className="eyebrow">Presets</span>
        <div className="preset-row">
          {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className="preset"
              onClick={() => applyPreset(key)}
            >
              {PRESETS[key].label}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Product name</span>
        <input
          className="input"
          name="productName"
          value={draft.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="e.g. Sony WH-1000XM5"
          maxLength={200}
          autoComplete="off"
          list={catalog.length ? "catalog-products" : undefined}
          aria-invalid={error === "Product name is required." || undefined}
        />
        {catalog.length ? (
          <datalist id="catalog-products">
            {catalog.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        ) : null}
      </label>

      <div className="field-row field-row--price">
        <label className="field">
          <span>Proposed price</span>
          <input
            className="input mono"
            name="proposedPrice"
            inputMode="decimal"
            value={draft.price}
            onChange={(e) => update("price", e.target.value)}
            placeholder="0.00"
            autoComplete="off"
            aria-invalid={error?.startsWith("Enter a price") || undefined}
          />
        </label>
        <label className="field">
          <span>Currency</span>
          <Select
            className="input"
            value={draft.currency}
            onChange={(value) => update("currency", value)}
            options={currencies}
          />
        </label>
      </div>

      <div className={simulateTrust ? "field-row field-row--3" : "field-row"}>
        <label className="field">
          <span>Source</span>
          <Select
            className="input"
            value={draft.source}
            onChange={(value) =>
              update("source", value as ProposalDraft["source"])
            }
            options={[
              { value: "MANUAL", label: "Manual" },
              { value: "CALENDAR", label: "Calendar" },
            ]}
          />
        </label>
        <label className="field">
          <span>Eval time</span>
          <input
            className="input mono"
            type="time"
            value={draft.time}
            onChange={(e) => update("time", e.target.value || "00:00")}
          />
        </label>
        {simulateTrust ? (
          <label className="field">
            <span>KERNEL (sim.)</span>
            <Select
              className="input small-text"
              value={draft.trust}
              onChange={(value) => update("trust", value as TrustSignal)}
              options={TRUST_OPTIONS}
            />
          </label>
        ) : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="form-actions">
        <LiquidButton
          type="submit"
          size="xl"
          className="rounded-full text-[15px]"
          aria-disabled={!valid || pending}
          disabled={pending}
        >
          {pending ? <span className="spinner" aria-hidden /> : null}
          {pending ? "Evaluating…" : "Evaluate proposal"}
        </LiquidButton>
        <span className="endpoint">
          POST /api/v1/proposals → /api/v1/evaluations
        </span>
      </div>
      <p className="footnote">
        Times are evaluated in {timeZone}.{" "}
        <Link href="/app/constraints" className="link-quiet">
          Change timezone
        </Link>
      </p>
    </form>
  );
}
