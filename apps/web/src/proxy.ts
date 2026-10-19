import { NextResponse, type NextRequest } from "next/server";

import { isMockMode } from "@/lib/data-source";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Mock mode has a single built-in demo user and no Supabase session.
  if (isMockMode()) {
    return request.nextUrl.pathname === "/login"
      ? NextResponse.redirect(new URL("/app", request.url))
      : NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  // Skip static assets, the health check, and PayPal webhooks (verified separately).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
