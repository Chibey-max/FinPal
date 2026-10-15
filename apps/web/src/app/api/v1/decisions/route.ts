import { decisionRowsQuerySchema } from "@finpal/contracts";
import { NextResponse, type NextRequest } from "next/server";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getUserDashboard } from "@/lib/backend";

// GET /api/v1/decisions?limit=200
// The signed-in user's decisions, newest first, each joined to its proposal,
// evaluation and current payment status.
export async function GET(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const query = decisionRowsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const dashboard = await getUserDashboard();
    return NextResponse.json({
      rows: await dashboard.listDecisionRows(userId, query),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
