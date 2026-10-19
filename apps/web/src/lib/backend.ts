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
  type AuditLog,
  type CalendarEventsService,
  type DashboardRepository,
  type EvaluationService,
  type PaymentService,
  type PaypalWebhookService,
  type ReviewDecisionService,
} from "@finpal/backend";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getComparableOffersService } from "@/lib/channel3";
import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Composition root: wires backend use cases to real infrastructure. The
// service-role client bypasses RLS, so every repository scopes by user id.
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
    trust: serverEnv.KERNEL_API_KEY
      ? createKernelTrustChecker(
          createKernelHttpClient({ apiKey: serverEnv.KERNEL_API_KEY }),
        )
      : undefined,
  });
  return evaluationService;
}

export function getPaymentService(): PaymentService {
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
    cancelUrl: `${appUrl}/dashboard?payment=cancelled`,
  });
  return paymentService;
}

export function getReviewDecisionService(): ReviewDecisionService {
  if (reviewService) return reviewService;
  const db = getServiceDb();
  reviewService = createReviewDecisionService({
    decisions: createSupabaseDecisionRepository(db),
    audit: getServiceAuditLog(),
  });
  return reviewService;
}

export function getCalendarEventsService(): CalendarEventsService {
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
  return getServiceAuditLog();
}

/**
 * Audit reads go through the signed-in user's own session, so RLS limits
 * rows to theirs in addition to the explicit user filter. Writes use the
 * service role inside use cases (users cannot insert audit events).
 */
export async function getUserAuditLog(): Promise<AuditLog> {
  const supabase = await createServerSupabaseClient();
  return createAuditLog(createSupabaseAuditEventRepository(supabase));
}

/** Dashboard reads, through the user's own session so RLS applies. */
export async function getUserDashboard(): Promise<DashboardRepository> {
  const supabase = await createServerSupabaseClient();
  return createSupabaseDashboardRepository(supabase);
}

/** Decision detail for the drawer, read through the user's own session. */
export async function getUserDecisionDetail() {
  const supabase = await createServerSupabaseClient();
  return createDecisionDetailService({
    dashboard: createSupabaseDashboardRepository(supabase),
    audit: createAuditLog(createSupabaseAuditEventRepository(supabase)),
  });
}
