import "server-only";

import { cache } from "react";

import {
  createAssistantService,
  createCalendarSuggestions,
  createConstraintsDrafter,
  createShoppingAgent,
  createSpendingForecaster,
  createAuditLog,
  createCalendarEventsService,
  createDecisionDetailService,
  createEvaluationService,
  createGoogleCalendarHttpClient,
  createGoogleRefreshTokenProvider,
  createGroqHttpClient,
  createKernelHttpClient,
  createKernelTrustChecker,
  createPaymentService,
  createPaypalWebhookService,
  createPayPalHttpClient,
  createQualityScoreService,
  createReviewDecisionService,
  createPostgresAuditEventRepository,
  createPostgresConstraintsRepository,
  createPostgresDashboardRepository,
  createPostgresDecisionRepository,
  createPostgresEvaluationRepository,
  createPostgresPaymentAttemptRepository,
  createPostgresPaypalWebhookEventRepository,
  createPostgresProposalRepository,
  localDayRange,
  localMonthRange,
  type AssistantService,
  type LlmClient,
  type ShoppingAgent,
  type AuditLog,
  type CalendarEventsService,
  type DashboardRepository,
  type EvaluationService,
  type GoogleAccessTokenProvider,
  type PaymentService,
  type PaypalWebhookService,
  type ReviewDecisionService,
} from "@finpal/backend";
import type {
  CalendarEventsPage,
  SpendingConstraints,
  TrustSignal,
} from "@finpal/contracts";

import { getComparableOffersService } from "@/lib/channel3";
import { isMockMode } from "@/lib/data-source";
import { getDb } from "@/lib/db";
import { getPublicEnv } from "@/lib/env";
import type { ServerEnv } from "@/lib/env-schema";
import { getGroqEnv, getServerEnv } from "@/lib/env.server";
import {
  describeConstraints,
  ensureSeeded,
  mockBackend,
  simulateTrust,
} from "@/lib/mock";
import * as mockRepo from "@/lib/mock/repositories";

// Composition root: wires backend use cases to real infrastructure, or to the
// in-memory mock (lib/mock) when FINPAL_DATA_SOURCE=mock. There is no
// row-level security in the database: every repository scopes by user id.
let paymentService: PaymentService | undefined;
let evaluationService: EvaluationService | undefined;
let reviewService: ReviewDecisionService | undefined;
let calendarService: CalendarEventsService | undefined;
let webhookService: PaypalWebhookService | undefined;
let assistantService: AssistantService | undefined;

function getServiceAuditLog(): AuditLog {
  return createAuditLog(createPostgresAuditEventRepository(getDb()));
}

export function getEvaluationService(): EvaluationService {
  if (isMockMode()) return mockBackend.evaluation;
  if (evaluationService) return evaluationService;
  const db = getDb();
  const serverEnv = getServerEnv();

  evaluationService = createEvaluationService({
    proposals: createPostgresProposalRepository(db),
    constraints: createPostgresConstraintsRepository(db),
    payments: createPostgresPaymentAttemptRepository(db),
    quality: createQualityScoreService({
      offers: getComparableOffersService(),
    }),
    evaluations: createPostgresEvaluationRepository(db),
    audit: getServiceAuditLog(),
    // Merchant trust is NOT_CHECKED until KERNEL_API_KEY is set.
    trust: serverEnv.KERNEL_API_KEY
      ? createKernelTrustChecker(
          createKernelHttpClient({ apiKey: serverEnv.KERNEL_API_KEY }),
        )
      : undefined,
  });
  return evaluationService;
}

export function getPaymentService(): PaymentService {
  if (isMockMode()) return mockBackend.payment;
  if (paymentService) return paymentService;

  const serverEnv = getServerEnv();
  const db = getDb();
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;

  paymentService = createPaymentService({
    paypal: createPayPalHttpClient({
      clientId: serverEnv.PAYPAL_CLIENT_ID,
      clientSecret: serverEnv.PAYPAL_CLIENT_SECRET,
      baseUrl: serverEnv.PAYPAL_API_BASE_URL,
    }),
    payments: createPostgresPaymentAttemptRepository(db),
    decisions: createPostgresDecisionRepository(db),
    audit: getServiceAuditLog(),
    returnUrl: `${appUrl}/api/v1/payments/return`,
    cancelUrl: `${appUrl}/app/payments?payment=cancelled`,
  });
  return paymentService;
}

/** Day 14: approve or reject a MANUAL_REVIEW decision. */
export function getReviewDecisionService(): ReviewDecisionService {
  if (isMockMode()) return mockBackend.review;
  if (reviewService) return reviewService;
  const db = getDb();
  reviewService = createReviewDecisionService({
    decisions: createPostgresDecisionRepository(db),
    audit: getServiceAuditLog(),
  });
  return reviewService;
}

/**
 * Google credentials for the calendar: a refresh token renews access tokens
 * automatically; a fixed access token is a local-testing fallback that stops
 * working after about an hour. Neither: calendar is not configured.
 */
function googleCalendarAccessToken(
  env: ServerEnv,
): GoogleAccessTokenProvider | string | undefined {
  if (
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_REFRESH_TOKEN
  ) {
    return createGoogleRefreshTokenProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken: env.GOOGLE_REFRESH_TOKEN,
    });
  }
  return env.GOOGLE_CALENDAR_ACCESS_TOKEN;
}

/** Upcoming events for proposal prefill; `configured: false` without Google. */
export function getCalendarEventsService(): CalendarEventsService {
  if (isMockMode()) return mockBackend.calendar;
  if (calendarService) return calendarService;
  const serverEnv = getServerEnv();
  const accessToken = googleCalendarAccessToken(serverEnv);
  calendarService = createCalendarEventsService({
    calendar: accessToken
      ? createGoogleCalendarHttpClient({
          accessToken,
          calendarId: serverEnv.GOOGLE_CALENDAR_ID,
        })
      : undefined,
  });
  return calendarService;
}

/**
 * Plain-language explanations and proposal drafts. Same in mock and live:
 * Groq when GROQ_API_KEY is set, rule-based text otherwise. Only decision
 * facts and the user's typed request are sent, never ids or emails.
 */
let llmClient: LlmClient | null | undefined;

/** One Groq client for every assistant feature; null without GROQ_API_KEY. */
function getLlm(): LlmClient | undefined {
  if (llmClient === undefined) {
    const env = getGroqEnv();
    llmClient = env.GROQ_API_KEY
      ? createGroqHttpClient({
          apiKey: env.GROQ_API_KEY,
          model: env.GROQ_MODEL,
        })
      : null;
  }
  return llmClient ?? undefined;
}

const reportLlmError = (error: unknown) =>
  console.error("Groq request failed", error);

export function getAssistantService(): AssistantService {
  assistantService ??= createAssistantService({
    llm: getLlm(),
    onError: reportLlmError,
  });
  return assistantService;
}

let shoppingAgent: ShoppingAgent | undefined;

/**
 * The shopping agent searches Channel3, submits the proposal and runs the
 * normal evaluation, so every agent purchase passes the same rules.
 */
export function getShoppingAgent(): ShoppingAgent {
  if (isMockMode()) {
    return createShoppingAgent({
      llm: getLlm(),
      offers: mockBackend.offers,
      evaluation: mockBackend.evaluation,
      audit: mockBackend.audit,
      onError: reportLlmError,
    });
  }
  shoppingAgent ??= createShoppingAgent({
    llm: getLlm(),
    offers: getComparableOffersService(),
    evaluation: getEvaluationService(),
    audit: getServiceAuditLog(),
    onError: reportLlmError,
  });
  return shoppingAgent;
}

export function getConstraintsDrafter() {
  return createConstraintsDrafter({ llm: getLlm(), onError: reportLlmError });
}

/** Purchase ideas from upcoming calendar events, for the user to confirm. */
export async function getEventSuggestions() {
  const page = await getCalendarEvents(50);
  return createCalendarSuggestions({
    llm: getLlm(),
    onError: reportLlmError,
  }).suggest(page.events, page.configured);
}

/** Pace, headroom and busy days ahead, with a short piece of advice. */
export async function getSpendingForecast(userId: string) {
  const constraints = await getUserConstraints(userId);
  const [spend, page] = await Promise.all([
    getSpendSummary(userId, constraints),
    getCalendarEvents(50),
  ]);
  return createSpendingForecaster({
    llm: getLlm(),
    onError: reportLlmError,
  }).forecast({ constraints, spend, events: page.events });
}

/** Verified PayPal webhooks. Live only: mock mode has no PayPal to call back. */
export function getPaypalWebhookService(): PaypalWebhookService {
  if (webhookService) return webhookService;
  const serverEnv = getServerEnv();
  const db = getDb();
  webhookService = createPaypalWebhookService({
    paypal: createPayPalHttpClient({
      clientId: serverEnv.PAYPAL_CLIENT_ID,
      clientSecret: serverEnv.PAYPAL_CLIENT_SECRET,
      baseUrl: serverEnv.PAYPAL_API_BASE_URL,
    }),
    payments: createPostgresPaymentAttemptRepository(db),
    events: createPostgresPaypalWebhookEventRepository(db),
    audit: getServiceAuditLog(),
    webhookId: serverEnv.PAYPAL_WEBHOOK_ID,
  });
  return webhookService;
}

/** Audit writer for server actions. */
export function getServiceRoleAuditLog(): AuditLog {
  if (isMockMode()) return mockBackend.audit;
  return getServiceAuditLog();
}

/** Audit reads, always filtered to the given user's events. */
export async function getUserAuditLog(): Promise<AuditLog> {
  if (isMockMode()) return mockBackend.audit;
  return getServiceAuditLog();
}

/**
 * The user's latest 200 decision rows, loaded once per request: the layout
 * (nav badges) and the page share one query instead of running it twice.
 */
export const getDecisionRows = cache(async (userId: string) =>
  (await getUserDashboard()).listDecisionRows(userId, { limit: 200 }),
);

/** Dashboard reads, filtered to the given user. */
export async function getUserDashboard(): Promise<DashboardRepository> {
  if (isMockMode()) return mockBackend.dashboard;
  return createPostgresDashboardRepository(getDb());
}

/** Decision detail with its audit trail. */
export async function getUserDecisionDetail() {
  if (isMockMode()) return mockBackend.decisionDetail;
  return createDecisionDetailService({
    dashboard: createPostgresDashboardRepository(getDb()),
    audit: getServiceAuditLog(),
  });
}

export async function getUserConstraints(
  userId: string,
): Promise<SpendingConstraints | null> {
  if (isMockMode()) return mockBackend.constraints.get(userId);
  return createPostgresConstraintsRepository(getDb()).get(userId);
}

/**
 * Saves the user's constraints, or clears them when `constraints` is null,
 * and records CONSTRAINTS_UPDATED. Clearing never grants permission: with no
 * constraints, evaluations go to manual review.
 */
export async function saveUserConstraints(
  userId: string,
  constraints: SpendingConstraints | null,
) {
  if (isMockMode()) await ensureSeeded();
  const repository = isMockMode()
    ? mockRepo.constraints
    : createPostgresConstraintsRepository(getDb());

  if (constraints) await repository.save(userId, constraints);
  else await repository.clear(userId);

  const audit = isMockMode() ? mockBackend.audit : getServiceAuditLog();
  await audit.record({
    userId,
    entityType: "constraints",
    entityId: userId,
    type: "CONSTRAINTS_UPDATED",
    payload: constraints ? describeConstraints(constraints) : { cleared: true },
  });
}

export interface SpendSummary {
  currency: string;
  spentToday: number;
  spentThisMonth: number;
}

/**
 * Money committed (AUTHORIZED or CAPTURED) today and this month in the
 * user's timezone: the same figures the evaluation counts against caps.
 */
export async function getSpendSummary(
  userId: string,
  constraints: SpendingConstraints | null,
): Promise<SpendSummary> {
  const timezone = constraints?.timezone ?? "UTC";
  const currency = constraints?.currency ?? "USD";
  const payments = isMockMode()
    ? mockBackend.payments
    : createPostgresPaymentAttemptRepository(getDb());
  const at = new Date();
  const day = localDayRange(at, timezone);
  const month = localMonthRange(at, timezone);
  const [spentToday, spentThisMonth] = await Promise.all([
    payments.sumCommitted(userId, currency, day.start, day.end),
    payments.sumCommitted(userId, currency, month.start, month.end),
  ]);
  return { currency, spentToday, spentThisMonth };
}

/**
 * Upcoming calendar events for the Calendar screen and proposal prefill.
 * A provider outage degrades to "configured, no events" rather than an error
 * page: the calendar is only ever a convenience.
 */
export async function getCalendarEvents(
  limit = 20,
): Promise<CalendarEventsPage> {
  try {
    return await getCalendarEventsService().listUpcoming(limit);
  } catch (error) {
    console.error("Calendar events could not be loaded", error);
    return { events: [], configured: true };
  }
}

/** Records the simulated KERNEL result chosen on the form (mock mode only). */
export function recordSimulatedTrust(proposalId: string, signal: TrustSignal) {
  if (isMockMode()) simulateTrust(proposalId, signal);
}
