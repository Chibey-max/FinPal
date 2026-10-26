import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  isRateLimited,
  rateLimited,
  unauthorized,
} from "@/lib/api";
import { getSpendingForecast } from "@/lib/backend";

// GET /api/v1/forecast
// Spending pace, headroom against the caps and busy days ahead. The numbers
// are computed by rules; Groq only labels events and words the advice.
export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`forecast:${userId}`, 20, 60_000)) return rateLimited();

  try {
    return NextResponse.json(await getSpendingForecast(userId));
  } catch (error) {
    return handleRouteError(error);
  }
}
