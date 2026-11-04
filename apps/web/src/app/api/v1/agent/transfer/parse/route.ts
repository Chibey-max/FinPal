import { transferParseRequestSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  isRateLimited,
  rateLimited,
  unauthorized,
} from "@/lib/api";
import { getTransferAgent, getUserConstraints } from "@/lib/backend";

// POST /api/v1/agent/transfer/parse  { text }
// Works out the amount and recipient from a spoken or typed command. Nothing
// is saved, so the user can correct what was heard before it goes anywhere.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`agent:${userId}`, 6, 60_000)) return rateLimited();

  try {
    const { text } = transferParseRequestSchema.parse(await request.json());
    const constraints = await getUserConstraints(userId);
    return NextResponse.json(
      await getTransferAgent().parse(text, constraints?.currency ?? "USD"),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
