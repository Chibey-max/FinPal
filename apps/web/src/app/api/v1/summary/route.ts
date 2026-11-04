import { NextResponse } from "next/server";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getSpendSummary, getUserConstraints } from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";

// GET /api/v1/summary
// What the overview needs beyond the decision rows: spend so far today and
// this month, and the constraints they are measured against (null when none
// are configured, in which case every proposal goes to manual review).
// `mock` is true when the server runs on simulated PayPal, Channel3 and KERNEL.
export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const constraints = await getUserConstraints(userId);
    const spend = await getSpendSummary(userId, constraints);
    return NextResponse.json({
      mock: isMockMode(),
      currency: spend.currency,
      timezone: constraints?.timezone ?? "UTC",
      spentToday: spend.spentToday,
      spentThisMonth: spend.spentThisMonth,
      caps: constraints?.amountCaps ?? null,
      constraints,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
