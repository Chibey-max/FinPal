import { NextResponse } from "next/server";
import { z } from "zod";

import {
  apiError,
  getApiUserId,
  handleRouteError,
  unauthorized,
} from "@/lib/api";
import { getUserDecisionDetail } from "@/lib/backend";

// GET /api/v1/decisions/:decisionId
// The proposal, full evaluation, decision, latest payment and audit trail.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ decisionId: string }> },
) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const decisionId = z.uuid().parse((await params).decisionId);
    const service = await getUserDecisionDetail();
    const detail = await service.getDecisionDetail(userId, decisionId);
    if (!detail) {
      return apiError(404, "DECISION_NOT_FOUND", "Decision not found.");
    }
    return NextResponse.json(detail);
  } catch (error) {
    return handleRouteError(error);
  }
}
