import { agentShopRequestSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  isRateLimited,
  rateLimited,
  unauthorized,
} from "@/lib/api";
import { getShoppingAgent, getUserConstraints } from "@/lib/backend";

// POST /api/v1/agent/shop  { need, eventId? }
// The shopping agent turns the need into a Channel3 search, picks an offer
// and submits it as an AGENT proposal, which is then evaluated by the normal
// rules. Paying still needs the user's approval in PayPal.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`agent:${userId}`, 6, 60_000)) return rateLimited();

  try {
    const input = agentShopRequestSchema.parse(await request.json());
    const constraints = await getUserConstraints(userId);
    const run = await getShoppingAgent().run(userId, {
      need: input.need,
      eventId: input.eventId,
      currency: constraints?.currency ?? "USD",
    });
    return NextResponse.json(run);
  } catch (error) {
    return handleRouteError(error);
  }
}
