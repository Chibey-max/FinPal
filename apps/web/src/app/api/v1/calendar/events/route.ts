import { calendarEventsQuerySchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getCalendarEvents } from "@/lib/backend";

// GET /api/v1/calendar/events?limit=20
// This user's upcoming events (title + start only).
export async function GET(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const query = calendarEventsQuerySchema.parse({
      limit: searchParams.get("limit") ?? undefined,
    });
    return NextResponse.json(await getCalendarEvents(userId, query.limit));
  } catch (error) {
    return handleRouteError(error);
  }
}
