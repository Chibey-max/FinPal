import "server-only";

import {
  createPaymentService,
  createPayPalHttpClient,
  createSupabaseAuditEventRepository,
  createSupabaseDecisionRepository,
  createSupabasePaymentAttemptRepository,
  type PaymentService,
} from "@finpal/backend";
import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";

// Composition root: wires backend use cases to real infrastructure. The
// service-role client bypasses RLS, so every repository scopes by user id.
let paymentService: PaymentService | undefined;

export function getPaymentService(): PaymentService {
  if (paymentService) return paymentService;

  const publicEnv = getPublicEnv();
  const serverEnv = getServerEnv();
  const db = createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL;

  paymentService = createPaymentService({
    paypal: createPayPalHttpClient({
      clientId: serverEnv.PAYPAL_CLIENT_ID,
      clientSecret: serverEnv.PAYPAL_CLIENT_SECRET,
      baseUrl: serverEnv.PAYPAL_API_BASE_URL,
    }),
    payments: createSupabasePaymentAttemptRepository(db),
    decisions: createSupabaseDecisionRepository(db),
    audit: createSupabaseAuditEventRepository(db),
    returnUrl: `${appUrl}/api/v1/payments/return`,
    cancelUrl: `${appUrl}/dashboard?payment=cancelled`,
  });
  return paymentService;
}
