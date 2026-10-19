import { calendarEventsQuerySchema } from "@finpal/contracts";
import { GoogleCalendarApiError } from "@finpal/backend";
import { NextResponse } from "next/server";

import {
  apiError,
  getApiUserId,
  handleRouteError,
  unauthorized,
} from "@/lib/api";
import { getCalendarEventsService } from "@/lib/backend";

// GET /api/v1/calendar/events?limit=20
// Upcoming events for proposal prefill (title + start only).
export async function GET(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const query = calendarEventsQuerySchema.parse({
      limit: searchParams.get("limit") ?? undefined,
    });
    const page = await getCalendarEventsService().listUpcoming(query.limit);
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof GoogleCalendarApiError) {
      const status =
        error.status === 0 || error.status >= 500 || error.status === 429
          ? 503
          : error.status === 401 || error.status === 403
            ? 502
            : 502;
      return apiError(status, "CALENDAR_UNAVAILABLE", error.message, {
        httpStatus: error.status,
      });
    }
    return handleRouteError(error);
  }
}
