import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { supabaseFetch } from "@/lib/supabase/fetch";

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

// Refreshes the Supabase session cookie on every request and performs the
// optimistic auth redirect. Pages and route handlers must still verify the user.
export async function updateSession(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { fetch: supabaseFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between client creation and getClaims(); it refreshes the token.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!isSignedIn && pathname.startsWith("/api/v1/")) {
    return NextResponse.json(
      { message: "Authentication required." },
      { status: 401 },
    );
  }

  if (!isSignedIn && isProtectedPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in users skip sign-in. /reset-password stays open: the email
  // link signs the user in with a recovery session to set a new password.
  if (
    isSignedIn &&
    (pathname === "/login" || pathname === "/forgot-password")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
