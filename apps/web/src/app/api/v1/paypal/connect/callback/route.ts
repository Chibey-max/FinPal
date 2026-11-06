import { NextResponse, type NextRequest } from "next/server";

import { getApiUserId, unauthorized } from "@/lib/api";
import { appOrigin } from "@/lib/app-origin";
import { getPaypalConnectionService } from "@/lib/backend";

const STATE_COOKIE = "finpal_paypal_state";

/** OAuth return from PayPal Log in with PayPal. */
export async function GET(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  const origin = appOrigin(request.nextUrl.origin);
  const back = new URL("/app/settings", origin);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !expected || state !== expected) {
    back.searchParams.set("paypal", "failed");
    const response = NextResponse.redirect(back);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  try {
    await getPaypalConnectionService().complete(userId, code);
    back.searchParams.set("paypal", "connected");
  } catch (error) {
    console.error("PayPal Connect callback failed", error);
    back.searchParams.set("paypal", "failed");
  }

  const response = NextResponse.redirect(back);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
