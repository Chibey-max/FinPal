import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

import { getPublicEnv } from "@/lib/env";

/**
 * The Supabase access token a native client (apps/mobile) sends as
 * `Authorization: Bearer <jwt>` instead of a session cookie, if any.
 */
export async function getBearerToken() {
  const header = (await headers()).get("authorization");
  return /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1] ?? null;
}

export async function createServerSupabaseClient() {
  // Read cookies first: it opts the route into dynamic rendering, so the build
  // never prerenders authenticated pages or needs Supabase keys.
  const cookieStore = await cookies();
  const env = getPublicEnv();

  // Bearer requests carry no cookies: act as the token's user, so row-level
  // security applies exactly as it does for a browser session.
  const token = await getBearerToken();
  if (token) {
    return createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  }

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot write cookies; the proxy refreshes them.
          }
        },
      },
    },
  );
}
