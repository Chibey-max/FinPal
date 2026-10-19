import { createProposalSchema, trustSignalSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getEvaluationService, recordSimulatedTrust } from "@/lib/backend";

// Mock mode only: the KERNEL result to simulate for this proposal. Ignored
// in live mode, where trust comes from the configured checker.
const simulationSchema = z
  .object({ simulation: z.object({ trust: trustSignalSchema }).optional() })
  .catch({});

// Creates a manual or calendar-prefilled purchase proposal. Evaluate it with
// POST /api/v1/evaluations.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const body = await request.json();
    const input = createProposalSchema.parse(body);
    const proposal = await getEvaluationService().createProposal(userId, input);
    const { simulation } = simulationSchema.parse(body);
    if (simulation) recordSimulatedTrust(proposal.id, simulation.trust);
    return NextResponse.json(proposal, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
