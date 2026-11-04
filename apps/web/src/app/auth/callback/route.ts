import { NextResponse, type NextRequest } from "next/server";

import { appOrigin } from "@/lib/app-origin";
import { safeNextPath } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Completes email confirmation and magic-link sign-ins (PKCE code exchange).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = appOrigin(request.nextUrl.origin);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // A dead reset link goes to the page that offers a new one, not to sign-in.
  if (next === "/reset-password") {
    return NextResponse.redirect(new URL(next, origin));
  }

  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(loginUrl);
}
