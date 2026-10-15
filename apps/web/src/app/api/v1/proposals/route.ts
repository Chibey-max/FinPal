import { createProposalSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getEvaluationService } from "@/lib/backend";

// Creates a manual or calendar-prefilled purchase proposal. Evaluate it with
// POST /api/v1/evaluations.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const input = createProposalSchema.parse(await request.json());
    const proposal = await getEvaluationService().createProposal(userId, input);
    return NextResponse.json(proposal, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
