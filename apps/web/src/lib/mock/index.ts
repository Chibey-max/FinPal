import "server-only";

import {
  createAuditLog,
  createCalendarEventsService,
  createComparableOffersService,
  createDecisionDetailService,
  createEvaluationService,
  createPaymentService,
  createQualityScoreService,
  createReviewDecisionService,
  type CalendarClient,
} from "@finpal/backend";
import type {
  SpendingConstraints,
  TrustSignal,
  Weekday,
} from "@finpal/contracts";

import { MOCK_USER } from "@/lib/data-source";
import { addDays, localDate, localTimeOfDay, zonedToDate } from "@/lib/zoned";

import {
  buyerApproves,
  calendarEvents,
  channel3,
  paypal,
  trust,
} from "./integrations";
import * as repo from "./repositories";
import { getStore } from "./store";

// Mock composition root: the real @finpal/backend use cases wired to the
// in-memory repositories and simulated integrations. Nothing here decides an
// outcome; the decision table and payment state machine do.

const audit = createAuditLog(repo.auditEvents);
const offers = createComparableOffersService({ channel3 });

const evaluation = createEvaluationService({
  proposals: repo.proposals,
  constraints: repo.constraints,
  payments: repo.payments,
  quality: createQualityScoreService({ offers }),
  evaluations: repo.evaluations,
  audit,
  trust,
});

const payment = createPaymentService({
  paypal,
  payments: repo.payments,
  decisions: repo.decisions,
  audit,
  // Never visited in mock mode: the UI shows a simulated Sandbox checkout.
  returnUrl: "/api/v1/payments/return",
  cancelUrl: "/app/payments?payment=cancelled",
});

const review = createReviewDecisionService({
  decisions: repo.decisions,
  audit,
});

// The coming week's events, through the backend's own calendar use case.
const calendarClient: CalendarClient = {
  async listUpcomingEvents(limit = 20) {
    const timeZone =
      getStore().constraints.values().next().value?.timezone ?? MOCK_TIMEZONE;
    return calendarEvents(timeZone).slice(0, limit);
  },
};
const calendar = createCalendarEventsService({ calendar: calendarClient });

const decisionDetail = createDecisionDetailService({
  dashboard: repo.dashboard,
  audit,
});

export const MOCK_TIMEZONE = "America/Los_Angeles";
const ALL_DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export const DEFAULT_CONSTRAINTS: SpendingConstraints = {
  timezone: MOCK_TIMEZONE,
  currency: "USD",
  timeWindows: [{ days: ALL_DAYS, start: "08:00", end: "22:00" }],
  amountCaps: { perPurchase: 500, daily: 800, monthly: 2500 },
};

// ---------------------------------------------------------------------------
// Seed: a believable history, produced by running the real use cases.

async function seed() {
  const store = getStore();
  const userId = MOCK_USER.id;
  const tz = MOCK_TIMEZONE;
  const realNow = new Date();
  const today = localDate(realNow, tz);
  // Keep every seeded timestamp in the past.
  const day =
    localTimeOfDay(realNow, tz) >= "11:45" ? today : addDays(today, -1);
  const dayOfMonth = Number(day.slice(8, 10));
  const earlierA = dayOfMonth > 5 ? addDays(day, -4) : day;
  const earlierB = dayOfMonth > 5 ? addDays(day, -2) : day;

  let clock = 0;
  const at = (date: string, time: string, seconds = 0) => {
    clock = zonedToDate(date, time, tz).getTime() + seconds * 1000;
    store.pinnedNow = new Date(clock);
  };
  const tick = (seconds: number) => {
    clock += seconds * 1000;
    store.pinnedNow = new Date(clock);
  };

  at(earlierA, "08:02");
  await repo.constraints.save(userId, DEFAULT_CONSTRAINTS);
  await audit.record({
    userId,
    entityType: "constraints",
    entityId: userId,
    type: "CONSTRAINTS_UPDATED",
    payload: describeConstraints(DEFAULT_CONSTRAINTS),
  });

  async function propose(
    date: string,
    time: string,
    productName: string,
    proposedPrice: number,
    options: {
      source?: "MANUAL" | "CALENDAR";
      sourceEventId?: string;
      trust?: TrustSignal;
    } = {},
  ) {
    at(date, time);
    const proposal = await evaluation.createProposal(userId, {
      productName,
      proposedPrice,
      currency: "USD",
      source: options.source ?? "MANUAL",
      sourceEventId: options.sourceEventId,
      proposedFor: zonedToDate(date, time, tz).toISOString(),
    });
    if (options.trust) store.trust.set(proposal.id, options.trust);
    tick(3);
    return evaluation.evaluateProposal(userId, proposal.id);
  }

  async function pay(
    decisionId: string,
    until: "CREATED" | "AUTHORIZED" | "CAPTURED" | "VOIDED",
  ) {
    tick(6);
    const created = await payment.createPaymentOrder({
      userId,
      decisionId,
      idempotencyKey: `idem_${decisionId}`,
    });
    if (until === "CREATED") return;
    tick(42);
    buyerApproves(created.paypalOrderId);
    await payment.completeApproval(userId, created.paypalOrderId);
    if (until === "AUTHORIZED") return;
    tick(until === "VOIDED" ? 3600 : 2);
    if (until === "CAPTURED") await payment.capturePayment(userId, created.id);
    else await payment.voidPayment(userId, created.id);
  }

  const mouse = await propose(
    earlierA,
    "10:05",
    "Logitech MX Master 3S",
    94.99,
  );
  await pay(mouse.decision.id, "CAPTURED");
  const kindle = await propose(earlierA, "16:20", "Kindle Paperwhite", 149.99);
  await pay(kindle.decision.id, "CAPTURED");
  const watch = await propose(
    earlierB,
    "12:30",
    "Garmin Forerunner 265",
    449.99,
  );
  await pay(watch.decision.id, "VOIDED");
  const airpods = await propose(earlierB, "19:45", "Apple AirPods Pro 2", 229);
  await pay(airpods.decision.id, "CAPTURED");

  await propose(day, "07:05", "Nintendo Switch OLED", 349.99);
  const anker = await propose(day, "09:12", "Anker 737 charger", 119.99);
  await pay(anker.decision.id, "CAPTURED");
  await propose(day, "11:40", "Leica M6 leather strap", 185, {
    source: "CALENDAR",
    sourceEventId: "evt_camera_walk",
  });

  store.pinnedNow = null;
}

export function describeConstraints(constraints: SpendingConstraints) {
  const window = constraints.timeWindows[0];
  return {
    timezone: constraints.timezone,
    currency: constraints.currency,
    window: window ? `${window.start}-${window.end}` : null,
    windows: constraints.timeWindows.length,
    perPurchase: constraints.amountCaps.perPurchase,
    daily: constraints.amountCaps.daily ?? null,
    monthly: constraints.amountCaps.monthly ?? null,
  };
}

// Versioned with the store key in store.ts.
const globalSeed = globalThis as typeof globalThis & {
  __finpalMockSeedV2?: Promise<void>;
};

export function ensureSeeded() {
  globalSeed.__finpalMockSeedV2 ??= seed().catch((error) => {
    globalSeed.__finpalMockSeedV2 = undefined;
    getStore().pinnedNow = null;
    throw error;
  });
  return globalSeed.__finpalMockSeedV2;
}

/** Wraps every method so it waits for the seed before touching the store. */
function seeded<T extends object>(service: T): T {
  return new Proxy(service, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        await ensureSeeded();
        return value.apply(target, args);
      };
    },
  });
}

export const mockBackend = {
  evaluation: seeded(evaluation),
  payment: seeded(payment),
  audit: seeded(audit),
  dashboard: seeded(repo.dashboard),
  decisionDetail: seeded(decisionDetail),
  constraints: seeded(repo.constraints),
  payments: seeded(repo.payments),
  offers: seeded(offers),
  review: seeded(review),
  calendar: seeded(calendar),
};

/** Simulated KERNEL result for a proposal (mock mode only). */
export function simulateTrust(proposalId: string, signal: TrustSignal) {
  getStore().trust.set(proposalId, signal);
}

export { buyerApproves };
