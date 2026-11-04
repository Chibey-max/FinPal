import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getApiUserId, unauthorized } from "@/lib/api";
import { appOrigin } from "@/lib/app-origin";
import { getCalendarConnectionService } from "@/lib/backend";

const STATE_COOKIE = "finpal_calendar_state";

// GET /api/v1/calendar/connect
// Sends the signed-in user to Google to allow read access to their calendar.
export async function GET(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  const service = getCalendarConnectionService();
  if (!service) {
    const back = new URL("/app/calendar", appOrigin(request.nextUrl.origin));
    back.searchParams.set("calendar", "failed");
    return NextResponse.redirect(back);
  }
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(service.consentUrl(state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/calendar",
    maxAge: 600,
  });
  return response;
}
