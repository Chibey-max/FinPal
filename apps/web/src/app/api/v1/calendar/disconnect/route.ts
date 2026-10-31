import { NextResponse, type NextRequest } from "next/server";

import { getApiUserId, unauthorized } from "@/lib/api";
import { appOrigin } from "@/lib/app-origin";
import { getCalendarConnectionService } from "@/lib/backend";

// POST /api/v1/calendar/disconnect
// Cancels access at Google and deletes the stored token.
export async function POST(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  const back = new URL("/app/rules", appOrigin(request.nextUrl.origin));
  try {
    await getCalendarConnectionService()?.disconnect(userId);
    back.searchParams.set("calendar", "disconnected");
  } catch (error) {
    console.error("Google Calendar disconnect failed", error);
    back.searchParams.set("calendar", "failed");
  }
  return NextResponse.redirect(back, 303);
}
