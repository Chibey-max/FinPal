import { agentShopRequestSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  isRateLimited,
  rateLimited,
  unauthorized,
} from "@/lib/api";
import {
  getPurchaseHistory,
  getShoppingAgent,
  getUserConstraints,
} from "@/lib/backend";
import { revalidateApp } from "@/lib/revalidate-app";

// POST /api/v1/agent/shop  { need, eventId? }
// The shopping agent turns the need into a Channel3 search, picks an offer
// and submits it as AGENT proposal(s). A leading quantity expands into one
// proposal per unit. Paying still needs the user's approval in PayPal.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`agent:${userId}`, 6, 60_000)) return rateLimited();

  try {
    const input = agentShopRequestSchema.parse(await request.json());
    const [constraints, history] = await Promise.all([
      getUserConstraints(userId),
      getPurchaseHistory(userId),
    ]);
    const runs = await getShoppingAgent().runAll(userId, {
      need: input.need,
      eventId: input.eventId,
      currency: constraints?.currency ?? "USD",
      history,
    });
    revalidateApp();
    return NextResponse.json({ runs });
  } catch (error) {
    return handleRouteError(error);
  }
}
