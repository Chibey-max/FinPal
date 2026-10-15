"use client";

import {
  offerCurrencySchema,
  type ProposalEvaluation,
} from "@finpal/contracts";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { DecisionCard } from "./decision-card";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      data?.error?.message ?? `Request failed (${response.status}).`,
    );
  }
  return data as T;
}

export function NewProposalForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ProposalEvaluation>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const plannedFor = String(form.get("proposedFor") ?? "");

    setPending(true);
    setError(undefined);
    setResult(undefined);
    try {
      const proposal = await postJson<{ id: string }>("/api/v1/proposals", {
        productName: form.get("productName"),
        proposedPrice: Number(form.get("proposedPrice")),
        currency: form.get("currency"),
        source: "MANUAL",
        // datetime-local is the browser's local time; send it as an instant.
        proposedFor: plannedFor
          ? new Date(plannedFor).toISOString()
          : undefined,
      });
      setResult(
        await postJson<ProposalEvaluation>("/api/v1/evaluations", {
          proposalId: proposal.id,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid max-w-2xl gap-8">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="productName">Product</Label>
          <Input
            id="productName"
            name="productName"
            required
            maxLength={200}
            placeholder="e.g. Sony WH-1000XM5 headphones"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="proposedPrice">Price</Label>
            <Input
              id="proposedPrice"
              name="proposedPrice"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              name="currency"
              defaultValue="USD"
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              {offerCurrencySchema.options.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="proposedFor">Planned for (optional)</Label>
            <Input id="proposedFor" name="proposedFor" type="datetime-local" />
          </div>
        </div>
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? "Checking…" : "Check purchase"}
        </Button>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </form>

      {result ? <DecisionCard result={result} /> : null}
    </div>
  );
}
