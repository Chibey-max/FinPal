import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { connection } from "next/server";

import { isMockMode, MOCK_USER, type AppUser } from "@/lib/data-source";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Authoritative check for protected pages; the proxy redirect is only optimistic.
//
// getClaims() verifies the session token's signature and expiry against the
// project's asymmetric signing key (ES256, fetched once and cached), so a
// normal request needs no call to Supabase Auth. cache(): the layout and the
// page share one check per request.
export const requireUser = cache(async (): Promise<AppUser> => {
  if (isMockMode()) {
    // Mock data changes per request; never prerender it at build time.
    await connection();
    return MOCK_USER;
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/login");
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
});

// Only allow same-origin relative redirects after sign-in.
export function safeNextPath(next: string | null | undefined) {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return "/app";
  }
  return next;
}
