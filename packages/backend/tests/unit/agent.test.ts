import type {
  CalendarEvent,
  ComparableOffer,
  OfferLookup,
  SpendingConstraints,
} from "@finpal/contracts";
import { describe, expect, it, vi } from "vitest";

import type { LlmClient } from "../../src/integrations/groq/llm-client";
import { createCalendarSuggestions } from "../../src/use-cases/calendar-suggestions";
import {
  createConstraintsDrafter,
  parseRulesText,
} from "../../src/use-cases/constraints-draft";
import {
  createShoppingAgent,
  needToQuery,
} from "../../src/use-cases/shopping-agent";
import { createSpendingForecaster } from "../../src/use-cases/spending-forecast";

const ID = "00000000-0000-4000-8000-000000000001";

const llmReturning = (...replies: (string | Error)[]): LlmClient => {
  const queue = [...replies];
  return {
    model: "test-model",
    complete: vi.fn(async () => {
      const next = queue.shift() ?? new Error("no reply");
      if (next instanceof Error) throw next;
      return next;
    }),
  };
};

const offer = (
  productId: string,
  title: string,
  merchant: string,
  price: number,
): ComparableOffer => ({
  productId,
  title,
  merchant,
  price,
  currency: "USD",
  url: `https://${merchant}/p/${productId}`,
});

const OFFERS = [
  offer("bose", "Bose QuietComfort Ultra headphones", "bose.com", 279),
  offer("sony", "Sony WH-1000XM5 headphones", "amazon.com", 289),
  offer("sony", "Sony WH-1000XM5 headphones", "bestbuy.com", 299),
  offer("apple", "AirPods Max headphones", "apple.com", 549),
];

function agentDeps(offers: ComparableOffer[] = OFFERS, status = "OK") {
  const lookup = vi.fn(
    async (): Promise<OfferLookup> =>
      ({
        query: "q",
        currency: "USD",
        status,
        offers,
        excluded: {
          currencyMismatch: 0,
          unavailable: 0,
          invalidPrice: 0,
          invalidUrl: 0,
          duplicate: 0,
        },
        fetchedAt: "2026-10-22T00:00:00.000Z",
        providerError: null,
      }) as OfferLookup,
  );
  const createProposal = vi.fn(async (_userId: string, input: object) => ({
    id: ID,
    sourceEventId: null,
    proposedFor: null,
    createdAt: "2026-10-22T00:00:00.000Z",
    ...input,
  }));
  const evaluateProposal = vi.fn(async () => ({
    evaluation: { id: ID },
    decision: { id: ID, outcome: "AUTO_APPROVE" },
  }));
  const record = vi.fn(async () => {});
  return {
    lookup,
    createProposal,
    evaluateProposal,
    record,
    deps: {
      offers: { lookup },
      evaluation: { createProposal, evaluateProposal },
      audit: { record, listActivity: vi.fn() },
    } as never,
  };
}

describe("needToQuery", () => {
  it.each([
    [
      "noise-cancelling headphones under $300 before my trip on Friday",
      "noise-cancelling headphones",
    ],
    ["I need a travel adapter for Lisbon", "travel adapter"],
    ["get me some running shoes, max 120", "running shoes"],
  ])("%s -> %s", (need, query) => expect(needToQuery(need)).toBe(query));
});

describe("shopping agent", () => {
  it("picks the best match within budget and submits an AGENT proposal", async () => {
    const t = agentDeps();
    const run = await createShoppingAgent(t.deps).run("user", {
      need: "noise-cancelling headphones under $300 before my trip",
      currency: "usd",
    });

    expect(t.lookup).toHaveBeenCalledWith({
      query: "noise-cancelling headphones",
      currency: "USD",
    });
    expect(run.status).toBe("PROPOSED");
    expect(run.brief.maxPrice).toBe(300);
    // One offer per product, cheapest merchant, within budget.
    expect(run.candidates.map((c) => c.merchant)).toEqual([
      "bose.com",
      "amazon.com",
    ]);
    expect(run.source).toBe("rules");
    expect(t.createProposal).toHaveBeenCalledWith("user", {
      productName: run.pick!.title,
      proposedPrice: run.pick!.price,
      currency: "USD",
      source: "AGENT",
      sourceEventId: undefined,
    });
    expect(t.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "AGENT_PURCHASE_PROPOSED",
        entityId: ID,
      }),
    );
    expect(t.evaluateProposal).toHaveBeenCalledWith("user", ID);
  });

  it("uses the model's brief and pick when they validate", async () => {
    const t = agentDeps();
    const llm = llmReturning(
      JSON.stringify({
        query: "noise cancelling headphones",
        maxPrice: 300,
        mustHaves: ["noise cancelling"],
      }),
      JSON.stringify({
        choice: 2,
        reason:
          "amazon.com sells the Sony WH-1000XM5 at 289, inside the budget.",
      }),
    );
    const run = await createShoppingAgent({ ...t.deps, llm }).run("user", {
      need: "headphones that block noise, under $300",
      currency: "USD",
    });
    expect(run.pick?.merchant).toBe("amazon.com");
    expect(run.source).toBe("llm");
    expect(run.model).toBe("test-model");
  });

  it("falls back to the rules when the model's reason invents a number", async () => {
    const t = agentDeps();
    const llm = llmReturning(
      JSON.stringify({ query: "headphones", maxPrice: null, mustHaves: [] }),
      JSON.stringify({
        choice: 1,
        reason: "Rated 4.9 by 12000 buyers, a great deal.",
      }),
    );
    const run = await createShoppingAgent({ ...t.deps, llm }).run("user", {
      need: "headphones",
      currency: "USD",
    });
    expect(run.reason).toContain("mid-priced new, in-stock match");
  });

  it("ignores a budget the user never stated", async () => {
    const t = agentDeps();
    const llm = llmReturning(
      JSON.stringify({ query: "headphones", maxPrice: 250, mustHaves: [] }),
      new Error("down"),
    );
    const run = await createShoppingAgent({ ...t.deps, llm }).run("user", {
      need: "good headphones",
      currency: "USD",
    });
    expect(run.brief.maxPrice).toBeNull();
    expect(run.status).toBe("PROPOSED");
  });

  it("reports OVER_BUDGET without creating a proposal", async () => {
    const t = agentDeps();
    const run = await createShoppingAgent(t.deps).run("user", {
      need: "headphones under $100",
      currency: "USD",
    });
    expect(run.status).toBe("OVER_BUDGET");
    expect(run.candidates[0]?.price).toBe(279);
    expect(t.createProposal).not.toHaveBeenCalled();
  });

  it("reports NO_OFFERS and SEARCH_FAILED", async () => {
    const empty = agentDeps([], "INSUFFICIENT_OFFERS");
    expect(
      (
        await createShoppingAgent(empty.deps).run("u", {
          need: "zzz widget",
          currency: "USD",
        })
      ).status,
    ).toBe("NO_OFFERS");
    const down = agentDeps([], "UNAVAILABLE");
    expect(
      (
        await createShoppingAgent(down.deps).run("u", {
          need: "zzz widget",
          currency: "USD",
        })
      ).status,
    ).toBe("SEARCH_FAILED");
  });
});

const NOW = new Date("2026-10-22T09:00:00.000Z");
const EVENTS: CalendarEvent[] = [
  { id: "e1", title: "Flight to NYC", startsAt: "2026-10-25T11:00:00.000Z" },
  {
    id: "e2",
    title: "Dad's birthday dinner",
    startsAt: "2026-10-27T18:00:00.000Z",
  },
  { id: "e3", title: "Dentist", startsAt: "2026-10-23T08:00:00.000Z" },
  { id: "old", title: "Past trip", startsAt: "2026-10-01T08:00:00.000Z" },
];

describe("calendar suggestions", () => {
  it("suggests from keywords without a model", async () => {
    const result = await createCalendarSuggestions({ now: () => NOW }).suggest(
      EVENTS,
      true,
    );
    expect(result.suggestions.map((s) => [s.eventId, s.need])).toEqual([
      ["e1", "noise-cancelling headphones"],
      ["e2", "e-reader gift"],
    ]);
  });

  it("keeps only model suggestions for real upcoming events", async () => {
    const llm = llmReturning(
      JSON.stringify({
        suggestions: [
          {
            eventId: "e1",
            need: "travel adapter",
            reason: "International flight.",
          },
          { eventId: "old", need: "luggage", reason: "Past event." },
          { eventId: "made-up", need: "anything", reason: "Not real." },
        ],
      }),
    );
    const result = await createCalendarSuggestions({
      llm,
      now: () => NOW,
    }).suggest(EVENTS, true);
    expect(result.source).toBe("llm");
    expect(result.suggestions).toEqual([
      expect.objectContaining({ eventId: "e1", need: "travel adapter" }),
    ]);
  });
});

describe("natural-language rules", () => {
  it("parses caps, days and hours", () => {
    expect(
      parseRulesText(
        "Don't spend more than $200 a day or $1,500 a month, max $80 per purchase, only on weekdays between 9am and 6pm",
      ),
    ).toEqual({
      currency: "USD",
      perPurchase: 80,
      daily: 200,
      monthly: 1500,
      timeWindows: [
        {
          days: ["MON", "TUE", "WED", "THU", "FRI"],
          start: "09:00",
          end: "18:00",
        },
      ],
    });
  });

  it("reads a period written before the amount, and day ranges", () => {
    expect(
      parseRulesText("monthly limit of €900, saturday to sunday after 10:00"),
    ).toEqual({
      currency: "EUR",
      perPurchase: null,
      daily: null,
      monthly: 900,
      timeWindows: [{ days: ["SAT", "SUN"], start: "10:00", end: "23:59" }],
    });
  });

  it("drops model amounts the text never stated", async () => {
    const llm = llmReturning(
      JSON.stringify({
        currency: "USD",
        perPurchase: 50,
        daily: 200,
        monthly: null,
        timeWindows: null,
      }),
    );
    const result = await createConstraintsDrafter({ llm }).draft(
      "keep it to $200 a day",
    );
    expect(result.source).toBe("llm");
    expect(result.draft.perPurchase).toBeNull();
    expect(result.draft.daily).toBe(200);
    expect(result.changed).toEqual(["currency", "daily"]);
  });
});

const CONSTRAINTS: SpendingConstraints = {
  timezone: "UTC",
  currency: "USD",
  timeWindows: [],
  amountCaps: { perPurchase: 500, daily: 300, monthly: 1000 },
};

describe("spending forecast", () => {
  it("warns when the monthly pace passes the cap, flagging busy events", async () => {
    const result = await createSpendingForecaster({ now: () => NOW }).forecast({
      constraints: CONSTRAINTS,
      spend: { currency: "USD", spentToday: 50, spentThisMonth: 900 },
      events: EVENTS,
    });
    expect(result.level).toBe("WARN");
    expect(result.projectedMonth).toBeGreaterThan(1000);
    expect(result.monthlyLeft).toBe(100);
    expect(result.busyEvents.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(result.source).toBe("rules");
  });

  it("rejects advice with numbers that are not in the facts", async () => {
    const llm = llmReturning(
      JSON.stringify({
        categories: { e1: "TRAVEL" },
        advice: "Set aside $750 for the trip.",
      }),
    );
    const result = await createSpendingForecaster({
      llm,
      now: () => NOW,
    }).forecast({
      constraints: CONSTRAINTS,
      spend: { currency: "USD", spentToday: 0, spentThisMonth: 100 },
      events: EVENTS,
    });
    expect(result.source).toBe("rules");
  });

  it("accepts faithful advice", async () => {
    const llm = llmReturning(
      JSON.stringify({
        categories: {},
        advice: "You have 900 left this month; keep the flight in mind.",
      }),
    );
    const result = await createSpendingForecaster({
      llm,
      now: () => NOW,
    }).forecast({
      constraints: CONSTRAINTS,
      spend: { currency: "USD", spentToday: 0, spentThisMonth: 100 },
      events: EVENTS,
    });
    expect(result.source).toBe("llm");
    expect(result.level).toBe("WATCH");
  });
});
