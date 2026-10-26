import { draftConstraintsRequestSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  isRateLimited,
  rateLimited,
  unauthorized,
} from "@/lib/api";
import { getConstraintsDrafter } from "@/lib/backend";

// POST /api/v1/constraints/draft  { text }
// Reads rules written in plain words into Constraints form fields. Nothing is
// saved: the user reviews the form and saves it.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`rules:${userId}`, 20, 60_000)) return rateLimited();

  try {
    const { text } = draftConstraintsRequestSchema.parse(await request.json());
    return NextResponse.json(await getConstraintsDrafter().draft(text));
  } catch (error) {
    return handleRouteError(error);
  }
}
