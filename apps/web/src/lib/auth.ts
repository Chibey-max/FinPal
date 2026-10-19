import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";

import { isMockMode, MOCK_USER, type AppUser } from "@/lib/data-source";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Authoritative check for protected pages; the proxy redirect is only optimistic.
export async function requireUser(): Promise<AppUser> {
  if (isMockMode()) {
    // Mock data changes per request; never prerender it at build time.
    await connection();
    return MOCK_USER;
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return { id: data.user.id, email: data.user.email ?? null };
}

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
