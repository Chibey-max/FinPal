import "server-only";

import {
  createAuditLog,
  createDecisionDetailService,
  createEvaluationService,
  createPaymentService,
  createPayPalHttpClient,
  createQualityScoreService,
  createSupabaseAuditEventRepository,
  createSupabaseConstraintsRepository,
  createSupabaseDashboardRepository,
  createSupabaseDecisionRepository,
  createSupabaseEvaluationRepository,
  createSupabasePaymentAttemptRepository,
  createSupabaseProposalRepository,
  type AuditLog,
  type DashboardRepository,
  type EvaluationService,
  type PaymentService,
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

function getServiceDb(): SupabaseClient {
  serviceDb ??= createClient(
    getPublicEnv().NEXT_PUBLIC_SUPABASE_URL,
    getServerEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return serviceDb;
}

export function getEvaluationService(): EvaluationService {
  if (evaluationService) return evaluationService;
  const db = getServiceDb();

  evaluationService = createEvaluationService({
    proposals: createSupabaseProposalRepository(db),
    constraints: createSupabaseConstraintsRepository(db),
    payments: createSupabasePaymentAttemptRepository(db),
    quality: createQualityScoreService({
      offers: getComparableOffersService(),
    }),
    evaluations: createSupabaseEvaluationRepository(db),
    audit: createAuditLog(createSupabaseAuditEventRepository(db)),
    // Merchant trust (KERNEL) is not configured yet: every check is N/A.
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
    audit: createAuditLog(createSupabaseAuditEventRepository(db)),
    returnUrl: `${appUrl}/api/v1/payments/return`,
    cancelUrl: `${appUrl}/dashboard?payment=cancelled`,
  });
  return paymentService;
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
