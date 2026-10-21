import { NextResponse } from "next/server";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getSpendSummary, getUserConstraints } from "@/lib/backend";

// GET /api/v1/summary
// What the overview needs beyond the decision rows: spend so far today and
// this month, and the caps it is measured against (null when no constraints
// are configured, in which case every proposal goes to manual review).
export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const constraints = await getUserConstraints(userId);
    const spend = await getSpendSummary(userId, constraints);
    return NextResponse.json({
      currency: spend.currency,
      timezone: constraints?.timezone ?? "UTC",
      spentToday: spend.spentToday,
      spentThisMonth: spend.spentThisMonth,
      caps: constraints?.amountCaps ?? null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
