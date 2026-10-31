import type { DecisionRow } from "@finpal/contracts";
import type { z } from "zod";

import type { LlmClient } from "../integrations/groq/llm-client";
import { numbersIn } from "./assistant";

// Shared plumbing for the agent features. Model replies are untrusted: they
// are parsed, schema-checked and, where they contain prose, checked so that
// every number in them comes from the facts the model was given.

/** Asks for one JSON object and validates it; null on any failure. */
export async function askJson<T>(
  llm: LlmClient,
  system: string,
  user: unknown,
  schema: z.ZodType<T>,
  options: { maxTokens?: number; onError?: (error: unknown) => void } = {},
): Promise<T | null> {
  try {
    const reply = await llm.complete({
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: typeof user === "string" ? user : JSON.stringify(user),
        },
      ],
      json: true,
      temperature: 0,
      maxTokens: options.maxTokens ?? 400,
    });
    const parsed = schema.safeParse(JSON.parse(reply));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    options.onError?.(error);
    return null;
  }
}

/**
 * True when every number in `text` is within rounding of a number in
 * `facts`, so the model cannot introduce prices, caps or dates of its own.
 */
export function onlyKnownNumbers(text: string, facts: string): boolean {
  const known = numbersIn(facts);
  return numbersIn(text).every((n) => known.some((k) => Math.abs(n - k) < 1));
}

/** Collapses whitespace and caps length; "" when the text is unusable. */
export function cleanText(text: string, max: number): string {
  const collapsed = text.split(/\s/).filter(Boolean).join(" ");
  return collapsed.length > max ? "" : collapsed;
}

/** Lowercase words of 3+ letters, for simple keyword matching. */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * What the agent may know about past purchases: no ids or URLs. Blocked items
 * are left out: a block can just mean the wrong time of day, which says
 * nothing about whether the person wants the product.
 */
export interface PurchaseHistory {
  bought: { title: string; price: number; on: string }[];
  rejected: { title: string; price: number }[];
  /** Median paid per item, or null with no purchases yet. */
  typicalPrice: number | null;
}

const HISTORY_LIMIT = 12;

export function summarizeHistory(rows: DecisionRow[]): PurchaseHistory {
  const paid = rows.filter(
    (row) =>
      row.paymentStatus === "CAPTURED" || row.paymentStatus === "AUTHORIZED",
  );
  const prices = paid.map((row) => row.amount).sort((a, b) => a - b);
  const brief = (row: DecisionRow) => ({
    title: row.productName.slice(0, 80),
    price: row.amount,
  });
  return {
    bought: paid.slice(0, HISTORY_LIMIT).map((row) => ({
      ...brief(row),
      on: row.decidedAt.slice(0, 10),
    })),
    rejected: rows
      .filter((row) => row.reviewStatus === "REJECTED")
      .slice(0, HISTORY_LIMIT)
      .map(brief),
    typicalPrice: prices.length
      ? (prices[Math.floor(prices.length / 2)] ?? null)
      : null,
  };
}

export const historyIsEmpty = (history: PurchaseHistory | undefined) =>
  !history || (!history.bought.length && !history.rejected.length);

/** Runs `task` over `items`, at most `limit` at a time, keeping their order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}
