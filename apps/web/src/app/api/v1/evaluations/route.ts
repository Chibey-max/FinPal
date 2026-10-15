import { evaluateProposalSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getEvaluationService } from "@/lib/backend";

// Runs constraints, Quality Score and merchant trust for a proposal, applies
// the decision table, and returns the stored evaluation and decision.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const { proposalId } = evaluateProposalSchema.parse(await request.json());
    const result = await getEvaluationService().evaluateProposal(
      userId,
      proposalId,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
