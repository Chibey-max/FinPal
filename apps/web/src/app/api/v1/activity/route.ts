import { activityQuerySchema } from "@finpal/contracts";
import { NextResponse, type NextRequest } from "next/server";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getUserAuditLog } from "@/lib/backend";

// GET /api/v1/activity?limit=50&before=<id>&entityType=payment_attempt&entityId=<id>
// The signed-in user's audit trail, newest first.
export async function GET(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const query = activityQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const auditLog = await getUserAuditLog();
    return NextResponse.json(await auditLog.listActivity(userId, query));
  } catch (error) {
    return handleRouteError(error);
  }
}
