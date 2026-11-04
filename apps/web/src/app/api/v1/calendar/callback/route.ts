import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getApiUserId, unauthorized } from "@/lib/api";
import { appOrigin } from "@/lib/app-origin";
import { getCalendarConnectionService } from "@/lib/backend";

const STATE_COOKIE = "finpal_calendar_state";

const sameState = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

// GET /api/v1/calendar/callback?code&state
// Google sends the user back here. The state must match the cookie set when
// they left, so nobody can attach their own calendar to someone's account.
export async function GET(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  const { searchParams } = request.nextUrl;
  const finish = (result: "connected" | "denied" | "failed") => {
    const back = new URL("/app/calendar", appOrigin(request.nextUrl.origin));
    back.searchParams.set("calendar", result);
    const response = NextResponse.redirect(back);
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/v1/calendar" });
    return response;
  };

  const expected = request.cookies.get(STATE_COOKIE)?.value;
  const state = searchParams.get("state");
  if (!expected || !state || !sameState(expected, state)) {
    return finish("failed");
  }
  if (searchParams.get("error")) return finish("denied");

  const code = searchParams.get("code");
  const service = getCalendarConnectionService();
  if (!code || !service) return finish("failed");
  try {
    await service.complete(userId, code);
    return finish("connected");
  } catch (error) {
    console.error("Google Calendar connection failed", error);
    return finish("failed");
  }
}
