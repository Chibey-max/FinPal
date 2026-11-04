import { NextResponse, type NextRequest } from "next/server";

import { appOrigin } from "@/lib/app-origin";
import { isMockMode } from "@/lib/data-source";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// A plain form post rather than a server action: a tab left open across a
// deploy still knows this URL, so signing out can't fail on a stale page.
export async function POST(request: NextRequest) {
  const origin = appOrigin(request.nextUrl.origin);
  // 303: the browser follows with a GET.
  if (isMockMode()) {
    return NextResponse.redirect(new URL("/", origin), 303);
  }
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", origin), 303);
}
