import { NextResponse } from "next/server";
import { z } from "zod";

import {
  apiError,
  getApiUserId,
  handleRouteError,
  isRateLimited,
  rateLimited,
  unauthorized,
} from "@/lib/api";
import { getAssistantService, getUserDecisionDetail } from "@/lib/backend";

// POST /api/v1/decisions/:decisionId/explain
// Plain-language summary of a decision. Groq words it when configured; the
// outcome itself always comes from the rules and is never changed here.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ decisionId: string }> },
) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`explain:${userId}`, 20, 60_000)) return rateLimited();

  try {
    const decisionId = z.uuid().parse((await params).decisionId);
    const detail = await (
      await getUserDecisionDetail()
    ).getDecisionDetail(userId, decisionId);
    if (!detail) {
      return apiError(404, "DECISION_NOT_FOUND", "Decision not found.");
    }
    const explanation = await getAssistantService().explainDecision(detail);
    return NextResponse.json(explanation);
  } catch (error) {
    return handleRouteError(error);
  }
}
