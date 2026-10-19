import "server-only";

import {
  createAuditLog,
  createCalendarEventsService,
  createDecisionDetailService,
  createEvaluationService,
  createGoogleCalendarHttpClient,
  createKernelHttpClient,
  createKernelTrustChecker,
  createPaymentService,
  createPaypalWebhookService,
  createPayPalHttpClient,
  createQualityScoreService,
  createReviewDecisionService,
  createSupabaseAuditEventRepository,
  createSupabaseConstraintsRepository,
  createSupabaseDashboardRepository,
  createSupabaseDecisionRepository,
  createSupabaseEvaluationRepository,
  createSupabasePaymentAttemptRepository,
  createSupabasePaypalWebhookEventRepository,
  createSupabaseProposalRepository,
  localDayRange,
  localMonthRange,
  type AuditLog,
  type CalendarEventsService,
  type DashboardRepository,
  type EvaluationService,
  type PaymentService,
  type PaypalWebhookService,
  type ReviewDecisionService,
} from "@finpal/backend";
import type {
  CalendarEventsPage,
  SpendingConstraints,
  TrustSignal,
} from "@finpal/contracts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getComparableOffersService } from "@/lib/channel3";
import { isMockMode } from "@/lib/data-source";
import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import {
  describeConstraints,
  ensureSeeded,
  mockBackend,
  simulateTrust,
} from "@/lib/mock";
import * as mockRepo from "@/lib/mock/repositories";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Composition root: wires backend use cases to real infrastructure, or to the
// in-memory mock (lib/mock) when FINPAL_DATA_SOURCE=mock. The service-role
// client bypasses RLS, so every repository scopes by user id.
let serviceDb: SupabaseClient | undefined;
let paymentService: PaymentService | undefined;
let evaluationService: EvaluationService | undefined;
let reviewService: ReviewDecisionService | undefined;
let calendarService: CalendarEventsService | undefined;
let webhookService: PaypalWebhookService | undefined;

function getServiceDb(): SupabaseClient {
  serviceDb ??= createClient(
    getPublicEnv().NEXT_PUBLIC_SUPABASE_URL,
    getServerEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return serviceDb;
}

function getServiceAuditLog(): AuditLog {
  return createAuditLog(createSupabaseAuditEventRepository(getServiceDb()));
}

export function getEvaluationService(): EvaluationService {
  if (isMockMode()) return mockBackend.evaluation;
  if (evaluationService) return evaluationService;
  const db = getServiceDb();
  const serverEnv = getServerEnv();

  evaluationService = createEvaluationService({
    proposals: createSupabaseProposalRepository(db),
    constraints: createSupabaseConstraintsRepository(db),
    payments: createSupabasePaymentAttemptRepository(db),
    quality: createQualityScoreService({
      offers: getComparableOffersService(),
    }),
    evaluations: createSupabaseEvaluationRepository(db),
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
  const db = getServiceDb();
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;

  paymentService = createPaymentService({
    paypal: createPayPalHttpClient({
      clientId: serverEnv.PAYPAL_CLIENT_ID,
      clientSecret: serverEnv.PAYPAL_CLIENT_SECRET,
      baseUrl: serverEnv.PAYPAL_API_BASE_URL,
    }),
    payments: createSupabasePaymentAttemptRepository(db),
    decisions: createSupabaseDecisionRepository(db),
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
  const db = getServiceDb();
  reviewService = createReviewDecisionService({
    decisions: createSupabaseDecisionRepository(db),
    audit: getServiceAuditLog(),
  });
  return reviewService;
}

/** Upcoming events for proposal prefill; `configured: false` without Google. */
export function getCalendarEventsService(): CalendarEventsService {
  if (isMockMode()) return mockBackend.calendar;
  if (calendarService) return calendarService;
  const serverEnv = getServerEnv();
  calendarService = createCalendarEventsService({
    calendar: serverEnv.GOOGLE_CALENDAR_ACCESS_TOKEN
      ? createGoogleCalendarHttpClient({
          accessToken: serverEnv.GOOGLE_CALENDAR_ACCESS_TOKEN,
          calendarId: serverEnv.GOOGLE_CALENDAR_ID,
        })
      : undefined,
  });
  return calendarService;
}

/** Verified PayPal webhooks. Live only: mock mode has no PayPal to call back. */
export function getPaypalWebhookService(): PaypalWebhookService {
  if (webhookService) return webhookService;
  const serverEnv = getServerEnv();
  const db = getServiceDb();
  webhookService = createPaypalWebhookService({
    paypal: createPayPalHttpClient({
      clientId: serverEnv.PAYPAL_CLIENT_ID,
      clientSecret: serverEnv.PAYPAL_CLIENT_SECRET,
      baseUrl: serverEnv.PAYPAL_API_BASE_URL,
    }),
    payments: createSupabasePaymentAttemptRepository(db),
    events: createSupabasePaypalWebhookEventRepository(db),
    audit: getServiceAuditLog(),
    webhookId: serverEnv.PAYPAL_WEBHOOK_ID,
  });
  return webhookService;
}

/** Service-role audit writer for server actions that persist via the user client. */
export function getServiceRoleAuditLog(): AuditLog {
  if (isMockMode()) return mockBackend.audit;
  return getServiceAuditLog();
}

/**
 * Audit reads go through the signed-in user's own session, so RLS limits
 * rows to theirs in addition to the explicit user filter. Writes use the
 * service role inside use cases (users cannot insert audit events).
 */
export async function getUserAuditLog(): Promise<AuditLog> {
  if (isMockMode()) return mockBackend.audit;
  const supabase = await createServerSupabaseClient();
  return createAuditLog(createSupabaseAuditEventRepository(supabase));
}

/** Dashboard reads, through the user's own session so RLS applies. */
export async function getUserDashboard(): Promise<DashboardRepository> {
  if (isMockMode()) return mockBackend.dashboard;
  const supabase = await createServerSupabaseClient();
  return createSupabaseDashboardRepository(supabase);
}

/** Decision detail with its audit trail, read through the user's own session. */
export async function getUserDecisionDetail() {
  if (isMockMode()) return mockBackend.decisionDetail;
  const supabase = await createServerSupabaseClient();
  return createDecisionDetailService({
    dashboard: createSupabaseDashboardRepository(supabase),
    audit: createAuditLog(createSupabaseAuditEventRepository(supabase)),
  });
}

export async function getUserConstraints(
  userId: string,
): Promise<SpendingConstraints | null> {
  if (isMockMode()) return mockBackend.constraints.get(userId);
  const supabase = await createServerSupabaseClient();
  return createSupabaseConstraintsRepository(supabase).get(userId);
}

/**
 * Saves (or, in mock mode, clears) the user's constraints and records
 * CONSTRAINTS_UPDATED. The live repository has no delete yet.
 */
export async function saveUserConstraints(
  userId: string,
  constraints: SpendingConstraints | null,
) {
  if (isMockMode()) {
    await ensureSeeded();
    if (constraints) await mockRepo.constraints.save(userId, constraints);
    else await mockRepo.constraints.clear(userId);
    await mockBackend.audit.record({
      userId,
      entityType: "constraints",
      entityId: userId,
      type: "CONSTRAINTS_UPDATED",
      payload: constraints
        ? describeConstraints(constraints)
        : { cleared: true },
    });
    return;
  }
  if (!constraints) {
    throw new Error(
      "Clearing constraints is not supported by the backend yet.",
    );
  }
  // User-scoped client: RLS guarantees users can only write their own row.
  const supabase = await createServerSupabaseClient();
  await createSupabaseConstraintsRepository(supabase).save(userId, constraints);
  // Audit inserts require the service role (users cannot write audit_events).
  await getServiceAuditLog().record({
    userId,
    entityType: "constraints",
    entityId: userId,
    type: "CONSTRAINTS_UPDATED",
    payload: describeConstraints(constraints),
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
    : createSupabasePaymentAttemptRepository(getServiceDb());
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
