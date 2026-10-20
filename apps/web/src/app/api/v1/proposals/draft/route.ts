import { draftProposalRequestSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  isRateLimited,
  rateLimited,
  unauthorized,
} from "@/lib/api";
import { getAssistantService } from "@/lib/backend";

// POST /api/v1/proposals/draft  { text, currency? }
// Turns a sentence into proposal fields for the form. Nothing is created:
// the user reviews the prefilled form and submits it themselves.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`draft:${userId}`, 20, 60_000)) return rateLimited();

  try {
    const input = draftProposalRequestSchema.parse(await request.json());
    return NextResponse.json(await getAssistantService().draftProposal(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
