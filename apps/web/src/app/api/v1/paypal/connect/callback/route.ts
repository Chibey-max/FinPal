import { NextResponse, type NextRequest } from "next/server";

import { appOrigin } from "@/lib/app-origin";
import { getPaypalConnectionService } from "@/lib/backend";
import { parseOAuthState } from "@/lib/oauth-state";

const STATE_COOKIE = "finpal_paypal_state";

function paypalStateSecret(): string | null {
  return process.env.PAYPAL_CLIENT_SECRET?.trim() || null;
}

/** OAuth return from PayPal Log in with PayPal. */
export async function GET(request: NextRequest) {
  const origin = appOrigin(request.nextUrl.origin);
  const back = new URL("/app/settings", origin);
  const finish = (result: "connected" | "failed") => {
    back.searchParams.set("paypal", result);
    const response = NextResponse.redirect(back);
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/v1/paypal" });
    return response;
  };

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const secret = paypalStateSecret();
  if (!code || !state || !secret) return finish("failed");

  const userId = parseOAuthState(state, secret);
  if (!userId) return finish("failed");

  // Same-browser double-submit when the cookie is present (same host).
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  if (expected && expected !== state) return finish("failed");

  try {
    await getPaypalConnectionService().complete(userId, code);
    return finish("connected");
  } catch (error) {
    console.error("PayPal Connect callback failed", error);
    return finish("failed");
  }
}
