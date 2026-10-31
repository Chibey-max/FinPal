import { NextResponse, type NextRequest } from "next/server";

import { isMockMode } from "@/lib/data-source";
import { SESSION_COOKIE } from "@/lib/session-cookie";

const protectedPrefixes = [
  "/app",
  "/dashboard",
  "/approvals",
  "/calendar",
  "/proposals",
  "/settings",
  "/dev",
];

function isProtectedPage(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Optimistic redirect only: it checks that a session cookie exists, not that
// it is valid. Pages (requireUser) and route handlers (getApiUser) verify the
// session against the database.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Mock mode has a single built-in demo user and no accounts to manage.
  if (isMockMode()) {
    return pathname === "/login"
      ? NextResponse.redirect(new URL("/app", request.url))
      : NextResponse.next();
  }

  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession && pathname.startsWith("/api/v1/")) {
    return NextResponse.json(
      { message: "Authentication required." },
      { status: 401 },
    );
  }

  if (!hasSession && isProtectedPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets, the health check, and PayPal webhooks (verified separately).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
