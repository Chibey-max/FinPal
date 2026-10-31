"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LiquidButton } from "@/components/ui/liquid-glass-button";

type Tone = "ok" | "warn" | "bad";

interface DemoItem {
  name: string;
  price: number;
  tag: string;
  tone: Tone;
  why: string;
}

// Scripted sample data: this section runs in the browser, with no account.
const LISTS: { label: string; items: DemoItem[] }[] = [
  {
    label: "Headphones, a charger, a flight upgrade",
    items: [
      {
        name: "Sony WH-1000XM5",
        price: 329,
        tag: "Approved",
        tone: "ok",
        why: "Good price: 3% under the middle of 5 offers. Inside your rules.",
      },
      {
        name: "Anker 737 charger",
        price: 89,
        tag: "Approved",
        tone: "ok",
        why: "Good price from a trusted merchant. Inside your rules.",
      },
      {
        name: "First-class flight upgrade",
        price: 1400,
        tag: "Blocked",
        tone: "bad",
        why: "Over your $500 per-purchase budget, so it can't be paid.",
      },
    ],
  },
  {
    label: "An office chair and a birthday gift",
    items: [
      {
        name: "Herman Miller Sayl chair",
        price: 445,
        tag: "Approved",
        tone: "ok",
        why: "Fits “ergonomic” and your budget, and it's a good price.",
      },
      {
        name: "Kindle Paperwhite",
        price: 149,
        tag: "Needs your OK",
        tone: "warn",
        why: "Only 2 offers found, so the rules want you to check it first.",
      },
    ],
  },
];

const STEP_MS = 900;
const WORKING = [
  "Reading your list…",
  "Searching real offers…",
  "Checking each one against your rules…",
];

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );

/** The landing page's "How it works": the real flow, with sample data. */
export function AgentDemo() {
  const [listIndex, setListIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const [paid, setPaid] = useState(false);
  const list = LISTS[listIndex]!;

  const shown = running ? Math.max(0, tick - WORKING.length) : 0;
  const finished = running && shown >= list.items.length;
  const ready = list.items.filter((item) => item.tone === "ok");
  const total = ready.reduce((sum, item) => sum + item.price, 0);

  useEffect(() => {
    if (!running || finished) return;
    const timer = setTimeout(() => setTick((t) => t + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [running, finished, tick]);

  function choose(index: number) {
    setListIndex(index);
    setRunning(false);
    setTick(0);
    setPaid(false);
  }

  const status = !running
    ? "Pick a list, then let the agent shop."
    : paid
      ? `Done. ${money(total)} paid with one approval, and every step is on record.`
      : finished
        ? "Your rules have checked everything. Nothing is bought until you approve."
        : (WORKING[Math.min(tick, WORKING.length - 1)] ??
          "Checking each one against your rules…");

  return (
    <div className="agent-demo" data-reveal>
      <div
        className="agent-demo__lists"
        role="group"
        aria-label="Sample shopping lists"
      >
        {LISTS.map((option, index) => (
          <button
            key={option.label}
            type="button"
            className="agent-demo__list"
            aria-pressed={index === listIndex}
            onClick={() => choose(index)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="agent-demo__status" aria-live="polite">
        {status}
      </p>

      {shown > 0 ? (
        <ul className="agent-demo__items">
          {list.items.slice(0, shown).map((item) => (
            <li key={item.name} className="agent-demo__item">
              <b>
                {item.name} · {money(item.price)}
              </b>
              <span className="agent-demo__tag" data-tone={item.tone}>
                {paid && item.tone === "ok" ? "Paid" : item.tag}
              </span>
              <small>{item.why}</small>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="agent-demo__foot">
        {!running ? (
          <LiquidButton
            type="button"
            size="lg"
            className="rounded-full"
            onClick={() => setRunning(true)}
          >
            Let the agent shop
          </LiquidButton>
        ) : finished && !paid ? (
          <LiquidButton
            type="button"
            size="lg"
            className="rounded-full"
            onClick={() => setPaid(true)}
          >
            Approve {money(total)}
          </LiquidButton>
        ) : paid ? (
          <LiquidButton asChild size="lg" className="rounded-full">
            <Link href="/app">Try it with your own list</Link>
          </LiquidButton>
        ) : (
          <span />
        )}
        <span className="agent-demo__note">sample data · sandbox only</span>
      </div>
    </div>
  );
}
