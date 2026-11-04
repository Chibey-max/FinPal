import { agentListRequestSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  isRateLimited,
  rateLimited,
  unauthorized,
} from "@/lib/api";
import {
  getBudgetLeft,
  getPurchaseHistory,
  getShoppingAgent,
  getUserConstraints,
} from "@/lib/backend";

// POST /api/v1/agent/list  { list }
// A whole shopping list: the agent asks about vague items and shops the rest.
// Every proposal goes through the normal rules; nothing is paid here.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`agent:${userId}`, 6, 60_000)) return rateLimited();

  try {
    const { list } = agentListRequestSchema.parse(await request.json());
    const constraints = await getUserConstraints(userId);
    const [history, budget] = await Promise.all([
      getPurchaseHistory(userId),
      getBudgetLeft(userId, constraints),
    ]);
    const runs = await getShoppingAgent().runList(userId, {
      list,
      currency: constraints?.currency ?? "USD",
      history,
      budget,
    });
    return NextResponse.json({ runs });
  } catch (error) {
    return handleRouteError(error);
  }
}
