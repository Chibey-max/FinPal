import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  isRateLimited,
  rateLimited,
  unauthorized,
} from "@/lib/api";
import { getEventSuggestions } from "@/lib/backend";

// GET /api/v1/agent/suggestions
// Purchase ideas from upcoming calendar events. Nothing is bought: each one
// is a need the user can send to the shopping agent.
export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`suggest:${userId}`, 20, 60_000)) return rateLimited();

  try {
    return NextResponse.json(await getEventSuggestions(userId));
  } catch (error) {
    return handleRouteError(error);
  }
}
