import { NextResponse, type NextRequest } from "next/server";

import { getApiUserId, unauthorized } from "@/lib/api";
import { appOrigin } from "@/lib/app-origin";
import { getPaypalConnectionService } from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";
import { createOAuthState } from "@/lib/oauth-state";

const STATE_COOKIE = "finpal_paypal_state";

function paypalStateSecret(): string | null {
  return process.env.PAYPAL_CLIENT_SECRET?.trim() || null;
}

/** GET /api/v1/paypal/connect — start Log in with PayPal. */
export async function GET(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  const origin = appOrigin(request.nextUrl.origin);
  const back = new URL("/app/settings", origin);

  if (isMockMode()) {
    await getPaypalConnectionService().connectMock(userId, {
      email: "demo@finpal.dev",
      payerId: "MOCKPAYERDEMO",
    });
    back.searchParams.set("paypal", "connected");
    return NextResponse.redirect(back);
  }

  const secret = paypalStateSecret();
  if (!secret) return unauthorized();

  const state = createOAuthState(userId, secret);
  const secure =
    process.env.NODE_ENV === "production" ||
    request.nextUrl.protocol === "https:";
  const response = NextResponse.redirect(
    getPaypalConnectionService().consentUrl(state),
  );
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/v1/paypal",
    maxAge: 600,
  });
  return response;
}
