import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { connection } from "next/server";

import { isMockMode, MOCK_USER, type AppUser } from "@/lib/data-source";
import { getSessionUser } from "@/lib/session";

// Authoritative check for protected pages; the proxy redirect is only
// optimistic. The session is looked up in the database once per request.
export const requireUser = cache(async (): Promise<AppUser> => {
  if (isMockMode()) {
    // Mock data changes per request; never prerender it at build time.
    await connection();
    return MOCK_USER;
  }
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return { id: user.id, email: user.email };
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
