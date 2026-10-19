import { reviewDecisionSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  apiError,
  getApiUserId,
  handleRouteError,
  unauthorized,
} from "@/lib/api";
import { getReviewDecisionService } from "@/lib/backend";
import { ReviewError } from "@finpal/backend";

// POST /api/v1/decisions/:decisionId/review  { action: "APPROVED" | "REJECTED" }
// Day 14: approve or reject a MANUAL_REVIEW decision.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ decisionId: string }> },
) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const decisionId = z.uuid().parse((await params).decisionId);
    const { action } = reviewDecisionSchema.parse(await request.json());
    const decision = await getReviewDecisionService().reviewDecision(
      userId,
      decisionId,
      action,
    );
    return NextResponse.json({ decision });
  } catch (error) {
    if (error instanceof ReviewError) {
      const status =
        error.code === "DECISION_NOT_FOUND"
          ? 404
          : error.code === "ALREADY_REVIEWED"
            ? 409
            : 422;
      return apiError(status, error.code, error.message);
    }
    return handleRouteError(error);
  }
}
